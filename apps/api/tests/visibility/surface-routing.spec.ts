import { VisibilityFilter } from '../../src/visibility/visibility.filter';
import type { PersonFollowRepository } from '../../src/persistence/person-follow.repository';
import type { BlockRepository } from '../../src/persistence/block.repository';
import { PostQueryService } from '../../src/modules/posts/post-query.service';
import { ProfileProjection } from '../../src/modules/people/profile.projection';
import { FollowingFeedService } from '../../src/modules/feed/following-feed.service';
import { PostSearchService } from '../../src/modules/search/post-search.service';
import { CommentService } from '../../src/modules/engagement/comment.service';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { FeedService } from '../../src/modules/feed/feed.service';
import { MessagePresenter } from '../../src/modules/conversations/message-presenter';
import { PlacePostsService } from '../../src/modules/places/place-posts.service';
import { SavedService } from '../../src/modules/saved/saved.service';
import { SURFACES } from './surfaces';

/**
 * ===========================================================================
 * THE OTHER HALF OF SC-009 / 004 SC-005.
 * ===========================================================================
 *
 * matrix.spec.ts proves the FILTER implements the decision table. It runs the
 * same `decide()` once per surface, so it would stay green against a read path
 * that quietly built its own predicate - which is exactly the failure
 * Constitution II names: "No read path may construct its own visibility
 * predicate."
 *
 * This suite proves each enumerated surface CONSULTS the filter. It is the shape
 * of test that would have caught the five occasions a read path in this
 * repository returned VisibilityFilter's candidate rows, or skipped it outright.
 *
 * Surfaces share the list in surfaces.ts, so a surface added to the matrix
 * without a routing probe here FAILS - see the completeness test at the bottom.
 * That is deliberate: the expensive mistake is a surface that looks covered.
 */

interface Probe {
  /** Must match a `name` in SURFACES exactly. */
  surface: string;
  /** Invokes the real read path. Returns nothing; the assertion is the spy. */
  run: (ctx: Ctx) => Promise<unknown>;
  /**
   * A surface that returns no posts AT ALL proves its claim structurally rather
   * than by calling the filter. Only `interest search` qualifies, and it must
   * say why.
   */
  returnsNoPosts?: string;
  /**
   * 005. This surface reaches the boundary through the second entry point, so
   * `filter.decide` is correctly never called - the probe asserts on the shared
   * block check itself instead.
   */
  consultsSharedBlockCheck?: boolean;
}

interface Ctx {
  filter: VisibilityFilter;
  queries: PostQueryService;
  decide: jest.SpyInstance;
  filterMany: jest.SpyInstance;
  getById: jest.SpyInstance;
  /**
   * 005. The block repository itself, spied.
   *
   * A review does not call `filter.decide` - it goes through the second entry
   * point, which delegates to the shared rules. Watching the block repository is
   * what proves BOTH paths end at the same question.
   */
  blocksSpy: jest.SpyInstance;
}

const VIEWER = { userId: 'viewer-1' };

const post = {
  postId: 'p1',
  authorId: 'a1',
  visibility: 'public' as const,
  processingState: 'ready' as const,
  createdAt: '2026-01-01T00:00:00Z',
  interestIds: ['i1'],
};

function build(): Ctx {
  const follows = { isFollowing: async () => false } as unknown as PersonFollowRepository;
  const blocks = { existsBetween: async () => false } as unknown as BlockRepository;
  const blocksSpy = jest.spyOn(
    blocks as unknown as { existsBetween: () => Promise<boolean> },
    'existsBetween',
  );
  const filter = new VisibilityFilter(follows, blocks);

  const posts = {
    findById: async () => post,
    findWithMedia: async () => ({ post, media: [] }),
    listByAuthor: async () => ({ items: [post], nextCursor: null }),
    listMedia: async () => [],
  };
  const index = { listByInterest: async () => ({ items: [post], nextCursor: null }) };
  const people = { findById: async () => ({ userId: 'a1', handle: 'a', displayName: 'A', status: 'active' }) };
  const interests = { findById: async () => ({ interestId: 'i1', name: 'I', slug: 'i' }) };

  const queries = new PostQueryService(
    posts as never,
    index as never,
    people as never,
    interests as never,
    filter,
    { find: async () => null } as never,
    { publicUrl: (k: string) => `http://store/${k}` } as never,
    // 008/US5. The one profile projection. A real instance rather than a stub:
    // it is pure apart from presigning, and stubbing it here would let this
    // probe pass while the projection itself was broken.
    new ProfileProjection({ presignedGetUrl: async (k: string) => `http://store/signed/${k}` } as never),
  );

  return {
    filter,
    queries,
    decide: jest.spyOn(filter, 'decide'),
    filterMany: jest.spyOn(filter, 'filter'),
    getById: jest.spyOn(queries, 'getById'),
    blocksSpy,
  };
}

const PROBES: Probe[] = [
  {
    surface: 'following feed',
    /**
     * 008/US3. A NEW CANDIDATE SOURCE FEEDING THE SAME BOUNDARY.
     *
     * The Following feed reads the follow graph rather than the interest
     * partitions, which is exactly the shape Principle II's second clause
     * governs: a new way of SELECTING must not become a new way of DECIDING.
     *
     * The service is constructed with stubs rather than resolved from the
     * module, like the comment and notification probes above and below - what is
     * being asserted is that this code path reaches `filter`, and a real module
     * would prove it more slowly and no more convincingly.
     */
    run: ({ filter, queries }) => {
      const following = new FollowingFeedService(
        {
          listFollowing: async () => ({
            items: [{ followerId: VIEWER.userId, followeeId: 'a1', followedAt: '2026-01-01T00:00:00Z' }],
            nextCursor: null,
          }),
        } as never,
        { listByAuthor: async () => ({ items: [post], nextCursor: null }) } as never,
        queries,
        filter,
      );
      return following.page(VIEWER);
    },
  },
  {
    surface: 'post search',
    /**
     * 008/US6. A term index is a CANDIDATE index, like the interest one.
     *
     * The row it returns carries a denormalised `visibility` so the filter can
     * run on Query results without a second read - which is a shortcut FOR the
     * filter, never a substitute for it. This probe is what says so.
     */
    run: ({ filter, queries }) => {
      const search = new PostSearchService(
        { listByTerm: async () => ({ items: [post], nextCursor: null }) } as never,
        queries,
        filter,
      );
      return search.search(VIEWER, 'anything');
    },
  },
  {
    surface: 'interest space',
    run: ({ queries }) => queries.listByInterest(VIEWER, 'i1'),
  },
  {
    surface: 'profile',
    run: ({ queries }) => queries.listByAuthor(VIEWER, 'a1'),
  },
  {
    surface: 'share link',
    run: ({ queries }) => queries.getById(VIEWER, 'p1'),
  },
  {
    surface: 'comments',
    // A comment is readable exactly when its post is, so the routing claim is
    // that CommentService gates on the POST through PostQueryService - never on
    // the comment, which is how the two would come to disagree.
    run: ({ queries }) => {
      const comments = new CommentService(
        { list: async () => ({ items: [], nextCursor: null }) } as never,
        {} as never,
        queries,
        { findById: async () => null } as never,
        { publish: async () => undefined } as never,
        new ProfileProjection({ presignedGetUrl: async (k: string) => `http://store/signed/${k}` } as never),
        // 008/US8. The edit/delete transaction. A stub agreeing with an older
        // constructor is the `ApiPage<T>` failure in miniature, and this file
        // has already gone red once for exactly that.
        {} as never,
      );
      return comments.list(VIEWER, 'p1');
    },
  },
  {
    surface: 'comment replies',
    /**
     * 008/US7. The SAME endpoint, and that is exactly why this probe exists.
     *
     * A reply is listed through `CommentService.list` like any other comment, so
     * the claim being proved is that a thread carrying REPLIES still gates on
     * the post and never on the comment. The stub returns a reply whose parent
     * is in the same page, which is the shape `groupWithParents` reorders — if
     * grouping were ever moved to a path that read rows directly, this probe
     * would stop seeing `PostQueryService` and fail.
     */
    run: ({ queries }) => {
      const comments = new CommentService(
        {
          list: async () => ({
            items: [
              { commentId: 'c1', postId: 'p1', authorId: 'a1', body: 'parent', createdAt: '2026-01-01T00:00:00Z', parentCommentId: null },
              { commentId: 'c2', postId: 'p1', authorId: 'a1', body: 'reply', createdAt: '2026-01-01T00:00:01Z', parentCommentId: 'c1' },
            ],
            nextCursor: null,
          }),
        } as never,
        {} as never,
        queries,
        { findById: async () => null } as never,
        { publish: async () => undefined } as never,
        new ProfileProjection({ presignedGetUrl: async (k: string) => `http://store/signed/${k}` } as never),
        // 008/US8. The edit/delete transaction. A stub agreeing with an older
        // constructor is the `ApiPage<T>` failure in miniature, and this file
        // has already gone red once for exactly that.
        {} as never,
      );
      return comments.list(VIEWER, 'p1');
    },
  },
  {
    surface: 'notifications',
    // A notification must not reveal an unopenable post, and visibility can
    // change AFTER the notification was generated - so the stored list is
    // filtered on read, not only at creation.
    run: ({ queries }) => {
      const notifications = new NotificationService(
        {
          list: async () => ({ items: [{ notificationId: 'n1', kind: 'comment', actorId: 'a1', postId: 'p1', createdAt: '2026-01-01T00:00:00Z' }], nextCursor: null }),
          // 008/US2. The read watermark and the derived unread count. This probe
          // is about ROUTING, not read state, so both answer the "never read"
          // case - which is also the state that makes `readAt` null and keeps
          // this row asserting what it always asserted.
          readWatermark: async () => null,
          unreadCount: async () => ({ count: 0, hasMore: false }),
        } as never,
        { findById: async () => ({ userId: 'a1', handle: 'a', displayName: 'A', status: 'active' }) } as never,
        {} as never,
        queries,
        { find: async () => null } as never,
        { publish: async () => undefined } as never,
        new ProfileProjection({ presignedGetUrl: async (k: string) => `http://store/signed/${k}` } as never),
      );
      return notifications.listVisible(VIEWER.userId);
    },
  },
  {
    surface: 'home feed',
    // The feed applies visibility LAST, on current state - never to a stored or
    // ranked copy. Ranking may reorder the admitted set; it may never widen it.
    run: ({ filter, queries }) => {
      // 007: the candidate set now comes from the RANKER rather than from the
      // viewer's followed interests. That is exactly why this row matters more
      // than it used to - the composed feed could not over-admit because it
      // only ever read partitions the viewer had subscribed to, and a ranked
      // feed reads across the catalogue. The routing claim is unchanged and the
      // accident that used to back it is gone.
      const ranking = {
        rank: async () => ({
          candidates: [{ ...post, interestId: 'i1' }],
          fanOutWidth: 1,
          fallback: false,
        }),
      };
      const feed = new FeedService(
        ranking as never,
        filter,
        { findById: async () => ({ userId: 'a1', handle: 'a', displayName: 'A', status: 'active' }) } as never,
        { followedAuthorIds: async () => new Set<string>() } as never,
        queries,
      );
      return feed.homeFeed(VIEWER);
    },
  },
  {
    surface: 'saved posts',
    // A save is a bookmark, not a copy. The saved ROW is a candidate; the
    // post's CURRENT state is the answer, so this consults the boundary twice -
    // once on the candidate set and once per surviving row.
    run: ({ queries, filter }) => {
      const service = new SavedService(
        { list: async () => ({ items: [{ ...post, userId: 'viewer-1', savedAt: 'z' }], nextCursor: null }) } as never,
        { listMedia: async () => [] } as never,
        queries,
        filter,
      );
      return service.list(VIEWER.userId);
    },
  },
  {
    surface: 'place page',
    // A place page is structurally an interest space: one Query, then the
    // filter. That sameness is the design (research R9) - it is what makes a
    // new surface one more row here rather than a new class of test.
    run: ({ queries, filter }) => {
      const service = new PlacePostsService(
        { listByPlace: async () => ({ items: [{ ...post, placeId: 'pl1' }], nextCursor: null }) } as never,
        { findWithMedia: async () => ({ post, media: [] }) } as never,
        queries,
        filter,
      );
      return service.list(VIEWER, 'pl1');
    },
  },
  {
    surface: 'shared post in a message',
    // TWO decisions, not one. ConversationAccess decided the reader may see the
    // THREAD; whether they may see a post shared inside it is answered
    // separately, per reader, by the post boundary. A presenter that trusted
    // conversation membership would leak a private post to whoever was in the
    // conversation.
    run: ({ queries }) => {
      const presenter = new MessagePresenter(queries, { listMedia: async () => [] } as never);
      return presenter.present(VIEWER, [
        {
          messageId: 'm1',
          conversationId: 'c1',
          authorId: 'a1',
          body: 'look at this',
          sharedPostId: 'p1',
          moderationState: 'visible',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ]);
    },
  },
  {
    surface: 'in-interest search',
    // The same method as the interest space, with `q`. That is the point:
    // matching happens AFTER the filter, on its output, so search cannot be a
    // second read path with its own predicate.
    run: ({ queries }) => queries.listByInterest(VIEWER, 'i1', { q: 'anything' }),
  },
  {
    surface: 'interest search',
    returnsNoPosts:
      'GET /interests?q= returns interest refs only - no post content and no post counts - ' +
      'so there is nothing for the filter to decide. If a post count is ever added to that ' +
      'response it becomes a real post read path and needs a probe here, not a comment.',
    run: async () => undefined,
  },
  {
    surface: 'place reviews',
    /**
     * 005/US2, and a DIFFERENT KIND of probe from every other row here.
     *
     * The place page is already surface 8 and returns posts; this is its second
     * read path, returning reviews through the second entry point. Probing only
     * the post path would report the place page as consulting the boundary while
     * its review path did not - which is exactly the gap this suite exists to
     * close, one level down.
     *
     * The spy is on the BLOCK REPOSITORY rather than on `filter.decide`: reviews
     * go through AuthoredContentVisibility, which delegates to the same shared
     * rules and the same RelationshipCache. `blocksSpy` firing is the proof that
     * the review path ended at the one place the block question is answered,
     * which is the whole of research R4.
     */
    run: async ({ filter, blocksSpy }) => {
      const { ReviewQueryService } = jest.requireActual<
        typeof import('../../src/ratings/review-query.service')
      >('../../src/ratings/review-query.service');
      const { AuthoredContentVisibility } = jest.requireActual<
        typeof import('../../src/visibility/authored-content')
      >('../../src/visibility/authored-content');

      const service = new ReviewQueryService(
        {
          listByPlace: async () => ({
            items: [
              {
                placeId: 'pl1',
                userId: 'a1',
                score: 5,
                body: 'good',
                createdAt: '2026-01-01T00:00:00Z',
                updatedAt: '2026-01-01T00:00:00Z',
              },
            ],
            nextCursor: null,
          }),
        } as never,
        { findById: async () => ({ userId: 'a1', handle: 'a', displayName: 'A' }) } as never,
        new AuthoredContentVisibility(filter),
        new ProfileProjection({ presignedGetUrl: async (k: string) => `http://store/signed/${k}` } as never),
      );
      await service.listByPlace(VIEWER, 'pl1');
      expect(blocksSpy.mock.calls.length).toBeGreaterThan(0);
    },
    consultsSharedBlockCheck: true,
  },
];

describe('every enumerated surface consults the one visibility boundary', () => {
  const probed = new Set(PROBES.map((p) => p.surface));

  for (const surface of SURFACES) {
    const run = surface.built ? it : it.skip;

    run(`${surface.name} routes through VisibilityFilter`, async () => {
      const probe = PROBES.find((p) => p.surface === surface.name);
      expect(probe).toBeDefined();

      if (probe!.returnsNoPosts) {
        expect(typeof probe!.returnsNoPosts).toBe('string');
        return;
      }

      const ctx = build();
      await probe!.run(ctx);

      // A surface whose probe asserts on the shared block check has already made
      // its assertion inside `run`. Requiring `filter.decide` here too would
      // force the review path to call the post entry point - the exact coupling
      // research R4 removed.
      if (probe!.consultsSharedBlockCheck) {
        expect(ctx.blocksSpy.mock.calls.length).toBeGreaterThan(0);
        return;
      }

      const consulted =
        ctx.decide.mock.calls.length > 0 ||
        ctx.filterMany.mock.calls.length > 0 ||
        ctx.getById.mock.calls.length > 0;
      expect(consulted).toBe(true);

      // And it must be told who is asking. A filter called with no viewer is a
      // filter that cannot exclude anything.
      const call =
        ctx.decide.mock.calls[0] ?? ctx.filterMany.mock.calls[0] ?? ctx.getById.mock.calls[0];
      expect(call?.[0]).toEqual(VIEWER);
    });
  }

  /**
   * The point of sharing surfaces.ts. A surface added to the matrix with no
   * probe here would otherwise report as covered while nothing checked that
   * anything calls the filter - the "screen test proves the screen works and
   * says nothing about whether anything calls it" defect, one level up.
   */
  it('has a probe for every BUILT surface, so the matrix count means something', () => {
    const unprobed = SURFACES.filter((s) => s.built && !probed.has(s.name)).map((s) => s.name);
    expect(unprobed).toEqual([]);
  });

  it('lists the surfaces still awaiting a probe, so none is silently forgotten', () => {
    const pending = SURFACES.filter((s) => !s.built).map((s) => `${s.name} (${s.story})`);
    console.log(`\nsurfaces without a routing probe yet: ${pending.join(', ') || 'none'}\n`);
    expect(pending.every((p) => typeof p === 'string')).toBe(true);
  });
});
