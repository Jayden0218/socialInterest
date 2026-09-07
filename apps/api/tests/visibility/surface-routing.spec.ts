import { VisibilityFilter } from '../../src/visibility/visibility.filter';
import type { PersonFollowRepository } from '../../src/persistence/person-follow.repository';
import type { BlockRepository } from '../../src/persistence/block.repository';
import { PostQueryService } from '../../src/modules/posts/post-query.service';
import { CommentService } from '../../src/modules/engagement/comment.service';
import { NotificationService } from '../../src/modules/notifications/notification.service';
import { FeedService } from '../../src/modules/feed/feed.service';
import { MessagePresenter } from '../../src/modules/conversations/message-presenter';
import { PlacePostsService } from '../../src/modules/places/place-posts.service';
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
}

interface Ctx {
  filter: VisibilityFilter;
  queries: PostQueryService;
  decide: jest.SpyInstance;
  filterMany: jest.SpyInstance;
  getById: jest.SpyInstance;
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
  );

  return {
    filter,
    queries,
    decide: jest.spyOn(filter, 'decide'),
    filterMany: jest.spyOn(filter, 'filter'),
    getById: jest.spyOn(queries, 'getById'),
  };
}

const PROBES: Probe[] = [
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
        { list: async () => ({ items: [{ notificationId: 'n1', kind: 'comment', actorId: 'a1', postId: 'p1', createdAt: '2026-01-01T00:00:00Z' }], nextCursor: null }) } as never,
        { findById: async () => ({ userId: 'a1', handle: 'a', displayName: 'A', status: 'active' }) } as never,
        {} as never,
        queries,
        { find: async () => null } as never,
        { publish: async () => undefined } as never,
      );
      return notifications.listVisible(VIEWER.userId);
    },
  },
  {
    surface: 'home feed',
    // The feed applies visibility LAST, on current state - never to a stored or
    // ranked copy. Ranking may reorder the admitted set; it may never widen it.
    run: ({ filter }) => {
      const index = { listByInterest: async () => ({ items: [{ ...post, interestId: 'i1' }], nextCursor: null }) };
      const feed = new FeedService(
        index as never,
        filter,
        { findById: async () => ({ userId: 'a1', handle: 'a', displayName: 'A', status: 'active' }) } as never,
        { followedIds: async () => ['i1'] } as never,
        { expand: () => ['i1'] } as never,
        { followedAuthorIds: async () => new Set<string>() } as never,
        { findById: async () => post, listMedia: async () => [] } as never,
      );
      return feed.homeFeed(VIEWER);
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
    surface: 'interest search',
    returnsNoPosts:
      'GET /interests?q= returns interest refs only - no post content and no post counts - ' +
      'so there is nothing for the filter to decide. If a post count is ever added to that ' +
      'response it becomes a real post read path and needs a probe here, not a comment.',
    run: async () => undefined,
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
