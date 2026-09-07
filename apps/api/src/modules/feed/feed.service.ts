import { Inject, Injectable } from '@nestjs/common';
import { PostInterestIndexRepository } from '../../persistence/post-interest-index.repository';
import { PostQueryService } from '../posts/post-query.service';
import { VisibilityFilter, type Viewer } from '../../visibility/visibility.filter';
import { PersonRepository } from '../../persistence/person.repository';
import { InterestFollowService } from '../interests/interest-follow.service';
import { PersonFollowService } from '../people/person-follow.service';
import { FollowExpansion } from './follow-expansion';
import { rank, type RankableItem } from './ranking';

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
  emptyStateHint: 'no_followed_interests' | 'no_posts_yet' | null;
  /** How many interest partitions this page read. Surfaced for bench:feed. */
  fanOutWidth: number;
}

/**
 * READ-TIME FAN-IN (research D1). The home feed is assembled per request, not
 * materialised per person.
 *
 * This is forced by the spec, not chosen for taste. FR-017 requires a visibility
 * change to apply immediately everywhere and SC-009 forbids any leak; a
 * materialised timeline would need every copy rewritten on a single
 * public->private flip, and any copy missed is an SC-009 failure. Assembling
 * here means visibility is evaluated once, against current state.
 *
 * The accepted cost is that latency scales with follow count - hence the
 * 200-interest cap, the parallel queries below, and bench:feed reporting p95
 * BROKEN DOWN BY follow count rather than as a single headline number.
 */
@Injectable()
export class FeedService {
  /**
   * Per-interest read depth. Each partition returns its newest few, which are
   * then merged and truncated: reading `limit` from every partition would be
   * wasteful, but reading too few risks a page that under-fills after
   * visibility filtering.
   */
  private static readonly PER_INTEREST_OVERFETCH = 2;

  constructor(
    @Inject(PostInterestIndexRepository) private readonly index: PostInterestIndexRepository,
    @Inject(VisibilityFilter) private readonly visibility: VisibilityFilter,
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(InterestFollowService) private readonly follows: InterestFollowService,
    @Inject(FollowExpansion) private readonly expansion: FollowExpansion,
    @Inject(PersonFollowService) private readonly personFollows: PersonFollowService,
    @Inject(PostQueryService) private readonly postQueries: PostQueryService,
  ) {}

  async homeFeed(
    viewer: { userId: string },
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<FeedPage> {
    const limit = opts.limit ?? 20;

    const followed = await this.follows.followedIds(viewer.userId);
    if (followed.length === 0) {
      // FR-036: a distinguishable empty state. "Follow some interests" and
      // "the interests you follow have no posts" need different prompts.
      return { items: [], nextCursor: null, emptyStateHint: 'no_followed_interests', fanOutWidth: 0 };
    }

    // FR-028: expanded at read time, so a sub-interest created after the follow
    // is included with no back-fill.
    const partitions = this.expansion.expand(followed);

    // The fan-in. Parallel, because the whole page waits on the slowest query.
    const perInterest = Math.max(3, Math.ceil(limit / 2)) * FeedService.PER_INTEREST_OVERFETCH;
    const pages = await Promise.all(
      partitions.map((interestId) =>
        this.index
          .listByInterest(interestId, { limit: perInterest })
          .catch(() => ({ items: [], nextCursor: null })),
      ),
    );

    // Merge newest-first, de-duplicating a post that appears under both a
    // sub-interest and its parent (FR-024 writes an index item for each).
    const seen = new Set<string>();
    const merged: FeedCandidate[] = [];
    for (const page of pages) {
      for (const item of page.items) {
        if (seen.has(item.postId)) continue;
        seen.add(item.postId);
        merged.push(item as FeedCandidate);
      }
    }
    /**
     * FR-033 - THE INTERSECTION RULE, and constitution principle I.
     *
     * `partitions` is derived ONLY from followed interests. A followed author's
     * posts are therefore already confined to those interests: nothing here
     * admits a post because of who wrote it, and nothing may be added that
     * would. Following a person can change the ORDER of this feed and never
     * its MEMBERSHIP.
     *
     * The failure this guards against is silent: a "show me more from people I
     * follow" convenience turns the product into an ordinary follower feed and
     * the interest structure becomes decoration. us4-fr033-boundary.spec.ts
     * asserts the negative case directly.
     */
    const followedAuthors = await this.personFollows.followedAuthorIds(viewer.userId);
    const rankable: RankableItem[] = merged.map((item) => ({
      ...item,
      byFollowedAuthor: followedAuthors.has(item.authorId),
    }));

    // FR-034: prominence within the already-admitted set.
    const ordered = rank(rankable);

    const after = this.decodeAfter(opts.cursor);
    const windowed = after ? ordered.filter((i) => i.createdAt < after) : ordered;

    // Visibility LAST, on current state, through the one boundary.
    const cache = this.visibility.newRequestCache();
    const authors = new Map<string, 'active' | 'deleting' | 'deleted'>();
    await Promise.all(
      [...new Set(windowed.slice(0, limit * 3).map((i) => i.authorId))].map(async (id) => {
        authors.set(id, (await this.people.findById(id))?.status ?? 'active');
      }),
    );

    const visible = await this.visibility.filter(
      viewer,
      windowed.slice(0, limit * 3).map((i) => ({ ...i, authorStatus: authors.get(i.authorId) ?? 'active' })),
      cache,
    );

    const page = visible.slice(0, limit);
    const last = page.at(-1);

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

    return {
      items,
      // Cursor is the timestamp boundary, not an offset (FR-035): posts
      // published mid-scroll cannot shift the reader's position.
      nextCursor: visible.length > limit && last ? this.encodeAfter(last.createdAt) : null,
      emptyStateHint: items.length === 0 ? 'no_posts_yet' : null,
      fanOutWidth: partitions.length,
    };
  }

  private encodeAfter(createdAt: string): string {
    return Buffer.from(JSON.stringify({ before: createdAt }), 'utf8').toString('base64url');
  }

  private decodeAfter(cursor: string | null | undefined): string | null {
    if (!cursor) return null;
    try {
      const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
        before?: string;
      };
      return parsed.before ?? null;
    } catch {
      return null;
    }
  }
}
