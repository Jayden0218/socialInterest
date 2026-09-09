import { Inject, Injectable } from '@nestjs/common';
import { PersonFollowRepository } from '../../persistence/person-follow.repository';
import { PostRepository, type PostItem } from '../../persistence/post.repository';
import { PostQueryService } from '../posts/post-query.service';
import { VisibilityFilter, type Viewer } from '../../visibility/visibility.filter';
import { MAX_FOLLOWED_PEOPLE } from '../people/person-follow.service';

/**
 * 008/US3 — THE FEED OF PEOPLE YOU CHOSE.
 *
 * Chronological, unranked, signal-free. It exists to be the PREDICTABLE
 * alternative to the ranked home feed, and if it ranked it would be a second
 * "For you" — which is the thing it exists to be an alternative to.
 *
 * The tab has been in the app since 007, rendered `disabled`, with a code
 * comment saying it was not built. That was honest rather than a lie, and it was
 * still a promise the product made and did not keep.
 *
 * WHAT THIS DELIBERATELY DOES NOT IMPORT: `SignalService`, `RankingService`,
 * `CandidateSource`, or any of the ranker's constants.
 * `tests/unit/following-feed-is-unranked.spec.ts` fails the build on the import,
 * before any post exists that would demonstrate the effect (FR-009).
 *
 * READ-TIME ASSEMBLY, like every other surface here. No materialised timeline
 * and no stored page: 001/FR-017 and SC-009 require a visibility change to land
 * on every surface immediately, and a stored page cannot guarantee that. This is
 * 001/D1, and 008 does not reopen it.
 */
@Injectable()
export class FollowingFeedService {
  /**
   * How many posts to pull per followed author before merging.
   *
   * Small on purpose. The merge takes the newest `limit` across everybody, so
   * fetching more than a page's worth from any one author only pays for rows the
   * sort will discard — and a prolific author cannot crowd the page out, because
   * they can contribute at most this many.
   */
  private static readonly PER_AUTHOR = 10;

  constructor(
    @Inject(PersonFollowRepository) private readonly follows: PersonFollowRepository,
    @Inject(PostRepository) private readonly posts: PostRepository,
    @Inject(PostQueryService) private readonly postQueries: PostQueryService,
    @Inject(VisibilityFilter) private readonly visibility: VisibilityFilter,
  ) {}

  async page(
    viewer: Viewer & { userId: string },
    opts: { limit?: number; cursor?: string | null } = {},
  ): Promise<{
    items: Record<string, unknown>[];
    nextCursor: string | null;
    emptyStateHint: 'no_follows' | null;
  }> {
    const limit = opts.limit ?? 20;

    /**
     * BOUNDED BY THE FOLLOW CAP, not by a page size.
     *
     * Reading only some of a person's follows would silently drop authors from
     * their own Following feed, which is worse than a slow page — so the bound
     * lives on the WRITE side (`MAX_FOLLOWED_PEOPLE`) where a person can see it,
     * rather than here where they cannot.
     */
    const following = await this.follows.listFollowing(viewer.userId, {
      limit: MAX_FOLLOWED_PEOPLE,
    });

    if (following.items.length === 0) {
      // FR-010: say what the surface is FOR, not merely that it is empty. The
      // hint is the server's answer; 006 recorded a test that invented its own
      // hint values and failed for its own reason rather than the product's.
      return { items: [], nextCursor: null, emptyStateHint: 'no_follows' };
    }

    /**
     * FAN OUT, THEN MERGE-SORT BY TIME. A5 (`postByAuthor`, GSI2) per author.
     *
     * The cursor is a TIMESTAMP, so resumption is a bound on each per-author
     * query rather than stored state — which is what keeps a visibility change
     * landing immediately (001/FR-017) and what makes the cursor survive an
     * author being followed or unfollowed between pages.
     */
    const before = opts.cursor ?? null;
    const perAuthor = await Promise.all(
      following.items.map((f) =>
        this.posts
          .listByAuthor(f.followeeId, { limit: FollowingFeedService.PER_AUTHOR })
          .then((page) => page.items),
      ),
    );

    const merged = perAuthor
      .flat()
      .filter((p) => (before ? p.createdAt < before : true))
      // Strictly descending by time, tie-broken by id so the order is total and
      // a page boundary cannot show the same post twice or skip one.
      .sort((a, b) => (b.createdAt === a.createdAt
        ? b.postId.localeCompare(a.postId)
        : b.createdAt.localeCompare(a.createdAt)));

    /**
     * OVERFETCH, THEN FILTER, THEN CUT.
     *
     * The boundary can remove any of these, so cutting to `limit` first would
     * return short pages whenever a followed author had a followers-only post
     * the viewer cannot see. Overfetching by a page keeps the page full without
     * letting the filter decide how many rows to read.
     */
    const cache = this.visibility.newRequestCache();
    const visible: PostItem[] = await this.visibility.filter(
      viewer,
      merged.slice(0, limit * 2 + 1),
      cache,
    );

    const pageRows = visible.slice(0, limit);
    const items = (
      await Promise.all(pageRows.map((row) => this.postQueries.responseFor(row.postId)))
    ).filter((p): p is Record<string, unknown> => p !== null);

    /**
     * The cursor is the last row's `createdAt`, and the next page asks for
     * strictly older. A post published between two requests is therefore missed
     * rather than duplicated, which is the right way round for a chronological
     * list: a repeat looks like a bug and a gap looks like the passage of time.
     */
    const last = pageRows[pageRows.length - 1];
    const more = visible.length > limit || merged.length > limit * 2;

    return {
      items,
      nextCursor: more && last ? last.createdAt : null,
      // Following somebody who has not posted is not the same as following
      // nobody, and only the second gets an explanation.
      emptyStateHint: null,
    };
  }
}
