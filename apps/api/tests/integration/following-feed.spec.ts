import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { PersonRepository } from '../../src/persistence/person.repository';
import { PostRepository } from '../../src/persistence/post.repository';
import { ProcessingService } from '../../src/modules/posts/processing.service';
import { SignalRepository } from '../../src/persistence/signal.repository';

/**
 * 008/T038, T039, T040 — US3. THE FEED OF PEOPLE YOU CHOSE.
 *
 * Three claims, and each fails differently:
 *
 *  - SC-004, only followed authors. A widened surface.
 *  - Chronological, ACROSS A PAGE BOUNDARY. 007 found five features' worth of
 *    lists that had never loaded a second page, so "the first page looks right"
 *    is the state this product shipped in for five features.
 *  - SC-005, FR-009, no signal moves. The structural half is
 *    `tests/unit/following-feed-is-unranked.spec.ts`, which fails when the
 *    IMPORT appears; this half fails when the EFFECT appears. Neither is
 *    sufficient alone.
 */
describe('008/US3 the Following feed', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  /** Publishes and drives to `ready` deterministically, as the other suites do. */
  const publishReady = async (token: string, caption: string): Promise<string> => {
    const created = await request(server())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({
        uploadIds: [await h.uploadId(token)],
        interestIds: [await h.topInterestId()],
        caption,
      });
    const postId = created.body.postId as string;
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);
    return postId;
  };

  const following = async (token: string, query = ''): Promise<request.Response> =>
    request(server()).get(`/v1/feed/following${query}`).set('authorization', `Bearer ${token}`);

  /** The harness suffixes handles with part of the ulid, so look the real one up. */
  const handleOf = async (userId: string): Promise<string> =>
    (await h.module.get(PersonRepository).findById(userId))!.handle;

  /**
   * Follows, AND ASSERTS IT WORKED.
   *
   * The first version of this suite built the handle by hand and every follow
   * 404'd, so the feed was correctly empty and three tests failed for a reason
   * that had nothing to do with the feed. An unchecked setup call is how a test
   * comes to fail somewhere other than where it broke.
   */
  const follow = async (token: string, followeeId: string): Promise<void> => {
    const res = await request(server())
      .put(`/v1/people/${await handleOf(followeeId)}/follow`)
      .set('authorization', `Bearer ${token}`);
    expect({ step: 'follow', status: res.status }).toEqual({ step: 'follow', status: 204 });
  };

  it('SC-004 returns ONLY followed authors, across a mixed fixture', async () => {
    const viewer = await h.createPerson('ffViewer');
    const viewerToken = await h.token(viewer);
    const friendA = await h.createPerson('ffFriendA');
    const friendB = await h.createPerson('ffFriendB');
    const stranger = await h.createPerson('ffStranger');

    const wanted = [
      await publishReady(await h.token(friendA), 'from friend A'),
      await publishReady(await h.token(friendB), 'from friend B'),
    ];
    const unwanted = await publishReady(await h.token(stranger), 'from a stranger');

    await follow(viewerToken, friendA);
    await follow(viewerToken, friendB);

    const res = await following(viewerToken);
    expect(res.status).toBe(200);
    const ids = res.body.items.map((p: { postId: string }) => p.postId);

    // BOTH directions. "contains what I follow" passes for a surface that
    // returns everything, and "excludes the stranger" passes for one that
    // returns nothing.
    expect({ hasWanted: wanted.every((id) => ids.includes(id)), hasUnwanted: ids.includes(unwanted) })
      .toEqual({ hasWanted: true, hasUnwanted: false });
  }, 120_000);

  it('returns hydrated POSTS, not visibility candidates', async () => {
    const viewer = await h.createPerson('ffShapeViewer');
    const viewerToken = await h.token(viewer);
    const author = await h.createPerson('ffShapeAuthor');
    await publishReady(await h.token(author), 'a caption that must survive');
    await follow(viewerToken, author);

    const res = await following(viewerToken);
    const post = res.body.items[0];
    /**
     * The SEVENTH place this could have gone wrong. Six surfaces in this
     * codebase have shipped returning VisibilityFilter's candidate rows -
     * `caption: null`, no media, no author, no counts - because nothing asserted
     * the response SHAPE. The filter decides what is visible, never the shape of
     * what to send.
     */
    expect({
      caption: post?.caption,
      hasAuthor: Boolean(post?.author?.handle),
      hasInterests: Array.isArray(post?.interests) && post.interests.length > 0,
      leakedAuthorId: Object.keys(post ?? {}).includes('authorId'),
    }).toEqual({
      caption: 'a caption that must survive',
      hasAuthor: true,
      hasInterests: true,
      leakedAuthorId: false,
    });
  }, 120_000);

  it('is strictly chronological, INCLUDING across a page boundary', async () => {
    const viewer = await h.createPerson('ffChronoViewer');
    const viewerToken = await h.token(viewer);
    const author = await h.createPerson('ffChronoAuthor');
    const authorToken = await h.token(author);

    for (let i = 0; i < 5; i++) {
      await publishReady(authorToken, `chrono ${i}`);
      // Distinct createdAt values; the sort is by timestamp and identical ones
      // would make the assertion vacuous.
      await new Promise((r) => setTimeout(r, 5));
    }
    await follow(viewerToken, author);

    const first = await following(viewerToken, '?limit=2');
    expect(first.body.items).toHaveLength(2);
    expect(first.body.page.nextCursor).toBeTruthy();

    const second = await following(viewerToken, `?limit=2&cursor=${encodeURIComponent(first.body.page.nextCursor)}`);
    expect(second.body.items.length).toBeGreaterThan(0);

    const all = [...first.body.items, ...second.body.items].map((p: { createdAt: string }) => p.createdAt);
    // Strictly descending, and no repeats - a cursor off by one boundary shows
    // the same post on both pages, which reads as a duplicate rather than a bug.
    expect(all).toEqual([...all].sort().reverse());
    expect(new Set(all).size).toBe(all.length);
  }, 120_000);

  it('FR-010 a viewer following nobody is told what the surface is FOR', async () => {
    const lonely = await h.createPerson('ffLonely');
    const res = await following(await h.token(lonely));
    expect({ items: res.body.items.length, hint: res.body.page.emptyStateHint })
      .toEqual({ items: 0, hint: 'no_follows' });
  }, 120_000);

  it('SC-005, FR-009 reading it moves NO ranking weight', async () => {
    const viewer = await h.createPerson('ffSignalViewer');
    const viewerToken = await h.token(viewer);
    const author = await h.createPerson('ffSignalAuthor');
    await publishReady(await h.token(author), 'should not train anything');
    await follow(viewerToken, author);

    const profiles = h.module.get(SignalRepository);
    const before = JSON.stringify((await profiles.profile(viewer)) ?? null);

    // Read it repeatedly. Once could miss a write that only happens on a second
    // page or a warm cache.
    await following(viewerToken);
    await following(viewerToken, '?limit=1');
    await following(viewerToken);

    const after = JSON.stringify((await profiles.profile(viewer)) ?? null);
    expect({ before, after }).toEqual({ before, after: before });
  }, 120_000);
});
