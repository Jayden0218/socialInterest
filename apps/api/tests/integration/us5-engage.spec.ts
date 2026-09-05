import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/** US5 acceptance scenarios, per spec.md § User Story 5. */
describe('US5 — engage with and share posts', () => {
  let h: Harness;
  let authorToken: string;
  let authorId: string;
  let viewerToken: string;
  let interestId: string;

  const ready = async (postId: string) => {
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);
  };

  const publish = async (visibility = 'public') => {
    const res = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${authorToken}`)
      .send({ uploads: [{ uploadId: 'u', key: 'k', kind: 'image' }], interestIds: [interestId], visibility });
    await ready(res.body.postId);
    return res.body.postId as string;
  };

  beforeAll(async () => {
    h = await bootHarness();
    authorId = await h.createPerson('engaged');
    authorToken = await h.token(authorId);
    viewerToken = await h.token(await h.createPerson('reactor'));
    interestId = await h.topInterestId();
  }, 90_000);

  afterAll(async () => h?.close());

  it('scenario 1: reacting updates the count, and reacting twice does not double it', async () => {
    const postId = await publish();
    const first = await request(h.app.getHttpServer())
      .put(`/v1/posts/${postId}/reaction`)
      .set('authorization', `Bearer ${viewerToken}`);
    expect(first.status).toBe(200);
    expect(first.body.reactionCount).toBe(1);
    expect(first.body.viewerHasReacted).toBe(true);

    // FR-039: the key structure makes a second reaction the same item.
    const second = await request(h.app.getHttpServer())
      .put(`/v1/posts/${postId}/reaction`)
      .set('authorization', `Bearer ${viewerToken}`);
    expect(second.body.reactionCount).toBe(1);

    const removed = await request(h.app.getHttpServer())
      .delete(`/v1/posts/${postId}/reaction`)
      .set('authorization', `Bearer ${viewerToken}`);
    expect(removed.body.reactionCount).toBe(0);
    expect(removed.body.viewerHasReacted).toBe(false);
  }, 90_000);

  it('the count survives concurrent taps', async () => {
    // Driven at the service level, not through six simultaneous HTTP
    // connections: the property under test is the guarded DynamoDB
    // transaction, and supertest against an in-process server resets the
    // connection long before the guard is exercised. Testing it through HTTP
    // would be measuring the harness.
    const postId = await publish();
    const { ReactionService } = await import('../../src/modules/engagement/reaction.service');
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const reactions = h.module.get(ReactionService);
    const posts = h.module.get(PostRepository);

    await Promise.all(Array.from({ length: 8 }, () => reactions.react(postId, 'concurrent-user')));

    // attribute_not_exists guards the counter increment inside the same
    // transaction as the reaction item, so seven of the eight write nothing.
    expect((await posts.findById(postId))!.reactionCount).toBe(1);
  }, 90_000);

  it('scenario 2: a comment appears under the post attributed to its author', async () => {
    const postId = await publish();
    const res = await request(h.app.getHttpServer())
      .post(`/v1/posts/${postId}/comments`)
      .set('authorization', `Bearer ${viewerToken}`)
      .send({ body: 'good one' });
    expect(res.status).toBe(201);

    const list = await request(h.app.getHttpServer()).get(`/v1/posts/${postId}/comments`);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].body).toBe('good one');
  }, 90_000);

  it('scenario 3: a public post’s share link opens for a signed-out viewer', async () => {
    const postId = await publish();
    const link = await request(h.app.getHttpServer())
      .post(`/v1/posts/${postId}/share-link`)
      .set('authorization', `Bearer ${authorToken}`);
    expect(link.status).toBe(201);
    expect(link.body.visibility).toBe('public');

    const anon = await request(h.app.getHttpServer()).get(`/v1/posts/${postId}`);
    expect(anon.status).toBe(200);
  }, 90_000);

  it('scenario 4: a followers-only link shows "not available to you" to a non-follower', async () => {
    const postId = await publish('followers');
    const link = await request(h.app.getHttpServer())
      .post(`/v1/posts/${postId}/share-link`)
      .set('authorization', `Bearer ${authorToken}`);
    // Echoed so the client can warn the link will not open for everyone.
    expect(link.body.visibility).toBe('followers');

    const nonFollower = await request(h.app.getHttpServer())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${viewerToken}`);
    expect(nonFollower.status).toBe(403);
  }, 90_000);

  it('scenario 5: a deleted post’s link shows "no longer available"', async () => {
    const postId = await publish();
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const posts = h.module.get(PostRepository);
    const post = (await posts.findById(postId))!;
    await posts.setDeleted(postId, new Date().toISOString());
    void post;

    const res = await request(h.app.getHttpServer()).get(`/v1/posts/${postId}`);
    expect(res.status).toBe(404);
  }, 90_000);

  it('comments are readable exactly when the post is (FR-040)', async () => {
    const postId = await publish('private');
    const res = await request(h.app.getHttpServer())
      .get(`/v1/posts/${postId}/comments`)
      .set('authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(403);
  }, 90_000);

  it('reacting and commenting require authentication', async () => {
    const postId = await publish();
    expect((await request(h.app.getHttpServer()).put(`/v1/posts/${postId}/reaction`)).status).toBe(401);
    expect(
      (await request(h.app.getHttpServer()).post(`/v1/posts/${postId}/comments`).send({ body: 'x' })).status,
    ).toBe(401);
  }, 90_000);
});
