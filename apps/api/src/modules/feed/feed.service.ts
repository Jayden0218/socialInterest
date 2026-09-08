import { Inject, Injectable } from '@nestjs/common';
import { PostQueryService } from '../posts/post-query.service';
import { VisibilityFilter } from '../../visibility/visibility.filter';
import { PersonRepository } from '../../persistence/person.repository';
import { PersonFollowService } from '../people/person-follow.service';
import { RankingService } from '../ranking/ranking.service';

/**
 * The index row the fan-in reads. Internal to the assembly pipeline: it is what
 * ranking and the visibility filter operate on, and it is NOT what a client gets.
 */
export interface FeedCandidate {
  postId: string;
  authorId: string;
  interestId: string;
  visibility: 'public' | 'followers' | 'private';
  processingState: 'pending' | 'processing' | 'ready' | 'failed';
  createdAt: string;
}

/**
 * What a feed page returns.
 *
 * The response used to be the index rows above - ids, visibility, a timestamp -
 * which a client cannot render. It now follows the contract's Post, so a feed
 * displays without a second request per item.
 */
/**
 * A feed item is the contract's Post, built by the one responder.
 *
 * Deliberately NOT a hand-written interface any more. The previous one declared
 * `interestIds: string[]` where the contract promises `interests: InterestRef[]`,
 * and omitted `media` entirely - so the feed satisfied its own type and not the
 * document both sides are generated from. A structural type here is what let the
 * two drift; PostQueryService.toResponse is now the single definition.
 */
export type FeedItem = Record<string, unknown>;

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
  /**
   * `no_followed_interests` is gone with the composed feed: a ranked feed
   * always has candidates, so "you follow nothing" is no longer a state the
   * feed can be in. `no_posts_yet` remains for a genuinely empty catalogue.
   */
  emptyStateHint: 'no_posts_yet' | null;
  /** How many interest partitions this page read. Surfaced for bench:feed. */
  fanOutWidth: number;
}

/**
 * READ-TIME ASSEMBLY (001 research D1) — UNCHANGED BY 007, and deliberately so.
 *
 * What changed is WHICH posts are considered: the feed is no longer composed
 * from the interests a viewer follows, it is RANKED from what they do
 * (constitution 2.0.0, Principle I as amended 2026-09-08). What did not change
 * is that the page is assembled per request against current state.
 *
 * D1 was forced by 001/FR-017 and SC-009 - a visibility change must apply
 * immediately everywhere - and those still stand. So:
 *
 *   RankingService proposes candidates → VisibilityFilter decides → hydrate
 *
 * in that order, in this request, every time. Ranking may precompute candidate
 * REFERENCES; it may never precompute what a viewer is allowed to see. That is
 * contracts/ranking-boundary.md, and C2-C5 of it are asserted against this
 * method.
 *
 * The subtle part, worth stating where the code is: the composed feed satisfied
 * Principle II BY ACCIDENT. It read only followed interests, so its candidate
 * set was already viewer-scoped and could not over-admit. Reading across the
 * catalogue removes that accident, which is why the boundary below is now
 * guarded by a contract instead of by the shape of the query above it.
 */
@Injectable()
export class FeedService {
  constructor(
    @Inject(RankingService) private readonly ranking: RankingService,
    @Inject(VisibilityFilter) private readonly visibility: VisibilityFilter,
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(PersonFollowService) private readonly personFollows: PersonFollowService,
    @Inject(PostQueryService) private readonly postQueries: PostQueryService,
  ) {}

  async homeFeed(
    viewer: { userId: string },
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<FeedPage> {
    const limit = opts.limit ?? 20;
    const { seen, depth } = this.decodeCursor(opts.cursor);

    /**
     * FR-029. Read here rather than inside the ranker, because "who does this
     * viewer follow" is viewer state and the ranker is deliberately kept away
     * from anything that looks like a decision about a viewer.
     */
    const followedAuthors = await this.personFollows.followedAuthorIds(viewer.userId);

    // PROPOSE. Ranking chooses candidates and their order, and nothing else.
    const { candidates, fanOutWidth } = await this.ranking.rank(
      viewer.userId,
      limit,
      followedAuthors,
      Date.now(),
      depth,
    );

    /**
     * FR-008, THE PAGING RULE, and the reason the cursor is not a timestamp.
     *
     * The composed feed was ordered by recency, so `createdAt < last` was both
     * a position and a promise: everything below the boundary was unseen. A
     * RANKED feed is not in timestamp order - a post competes as though it were
     * hours newer - so that same cursor would silently drop every candidate
     * newer than the last item of the previous page, however well it scored.
     * The boundary would have been a filter on the wrong axis, and it would
     * have looked like it worked, because page one is always correct.
     *
     * So the cursor carries WHAT WAS SHOWN, not where the reader got to. The
     * cost is a cursor that grows with the session, bounded below; the benefit
     * is that it holds across processes and cannot be invalidated by a post
     * published mid-scroll (001/FR-035's guarantee, kept).
     */
    const unseen = candidates.filter((c) => !seen.has(c.postId));

    /**
     * DECIDE. Visibility LAST, on current state, through the one boundary.
     *
     * This is the line contracts/ranking-boundary.md C2 asserts the position
     * of. Moving it above the ranker, or dropping it because the ranker
     * "already narrowed the set", is the failure the whole contract exists to
     * prevent - and it is exactly what a reasonable person would try when
     * optimising this method.
     */
    const cache = this.visibility.newRequestCache();
    const considered = unseen.slice(0, limit * 3);
    const authors = new Map<string, 'active' | 'deleting' | 'deleted'>();
    await Promise.all(
      [...new Set(considered.map((i) => i.authorId))].map(async (id) => {
        authors.set(id, (await this.people.findById(id))?.status ?? 'active');
      }),
    );

    const visible = await this.visibility.filter(
      viewer,
      considered.map((i) => ({ ...i, authorStatus: authors.get(i.authorId) ?? 'active' })),
      cache,
    );

    const page = visible.slice(0, limit);

    /**
     * Hydrate. Until now the feed returned the INDEX ROWS - postId, authorId,
     * interestId, visibility, processingState, createdAt - and nothing else. No
     * caption, no media, no author, no counts. A client got a list of ids and a
     * blank feed.
     *
     * Nothing caught it because every test asserted on ids: the integration
     * suites check a postId is present, and even the end-to-end journeys use
     * `ids).toContain(...)`. Only rendering the feed showed it was empty.
     *
     * One batched read for the page, after visibility has already narrowed the
     * set, so the cost is bounded by `limit` rather than by the fan-in width.
     *
     * Through PostQueryService.responseFor, NOT a shape built here. This method
     * used to hand-roll its own: `interestIds` (raw ids) where the contract
     * promises `interests` (refs with names), and no media. A client generated
     * from the contract crashes on `post.interests.map` - which is exactly the
     * defect 002 recorded for post detail, reproduced on a second endpoint
     * because a second responder existed to reproduce it in.
     */
    const items = await Promise.all(page.map((row) => this.postQueries.responseFor(row.postId))).then(
      (rows) => rows.filter((r): r is NonNullable<typeof r> => r !== null),
    );

    /**
     * A page that under-fills is the end of the feed. Anything else would page
     * forever against a catalogue that has run out, which reads to a person as
     * a spinner that never resolves - and 001/SC-009's "no visible interruption"
     * is not satisfied by an interruption that never ends.
     */
    const exhausted = page.length < limit;

    return {
      items,
      nextCursor: exhausted
        ? null
        : this.encodeCursor([...seen, ...page.map((row) => row.postId)], depth + 1),
      emptyStateHint: items.length === 0 && depth === 0 ? 'no_posts_yet' : null,
      fanOutWidth,
    };
  }

  /**
   * How many post ids a cursor carries before the oldest are dropped.
   *
   * A person who scrolls past this in one session may see a post again, which
   * is the honest trade: the alternative is server-side session state, which
   * would not survive the restart it is meant to be transparent to, or an
   * unbounded cursor, which grows until a request header rejects it. 500 is
   * twenty-five pages.
   */
  private static readonly SEEN_CAP = 500;

  private encodeCursor(seen: string[], depth: number): string {
    const trimmed = seen.slice(-FeedService.SEEN_CAP);
    return Buffer.from(JSON.stringify({ seen: trimmed, depth }), 'utf8').toString('base64url');
  }

  private decodeCursor(cursor: string | null | undefined): { seen: Set<string>; depth: number } {
    if (!cursor) return { seen: new Set(), depth: 0 };
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        seen?: unknown;
        depth?: unknown;
      };
      return {
        seen: new Set(Array.isArray(parsed.seen) ? parsed.seen.filter((v): v is string => typeof v === 'string') : []),
        depth: typeof parsed.depth === 'number' && parsed.depth >= 0 ? Math.min(parsed.depth, 50) : 0,
      };
    } catch {
      // A malformed cursor starts the session over rather than failing the
      // request. A feed that 400s on a stale link is worse than one that repeats.
      return { seen: new Set(), depth: 0 };
    }
  }
}
