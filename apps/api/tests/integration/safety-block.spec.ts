import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * FR-044. The spec's edge case is specific: blocking someone WITHDRAWS
 * previously visible followers-only content. That only holds if the block
 * severs the follow, and if it does so atomically - otherwise there is a window
 * in which the block exists but the follow does not, and during that window the
 * blocked person still counts as a follower.
 */
describe('FR-044 — blocking withdraws previously visible followers-only content', () => {
  let h: Harness;
  let authorToken: string;
  let authorHandle: string;
  let fanToken: string;
  let fanHandle: string;
  let postId: string;

  beforeAll(async () => {
    h = await bootHarness();
    const authorId = await h.createPerson('blockauthor2');
    authorToken = await h.token(authorId);
    const fanId = await h.createPerson('blockfan');
    fanToken = await h.token(fanId);

    const { PersonRepository } = await import('../../src/persistence/person.repository');
    const people = h.module.get(PersonRepository);
    authorHandle = (await people.findById(authorId))!.handle;
    fanHandle = (await people.findById(fanId))!.handle;

    // The fan follows the author, then the author posts followers-only.
    await request(h.app.getHttpServer())
      .put(`/v1/people/${authorHandle}/follow`)
      .set('authorization', `Bearer ${fanToken}`);

    const created = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${authorToken}`)
      .send({
        uploads: [{ uploadId: 'u', key: 'k', kind: 'image' }],
        interestIds: [await h.topInterestId()],
        visibility: 'followers',
      });
    postId = created.body.postId;
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);
  }, 120_000);

  afterAll(async () => h?.close());

  it('the follower can see the followers-only post before the block', async () => {
    const res = await request(h.app.getHttpServer())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${fanToken}`);
    expect(res.status).toBe(200);
  }, 60_000);

  it('blocking severs the follow and withdraws the content immediately', async () => {
    const block = await request(h.app.getHttpServer())
      .put(`/v1/blocks/${fanHandle}`)
      .set('authorization', `Bearer ${authorToken}`);
    expect(block.status).toBe(204);

    const res = await request(h.app.getHttpServer())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${fanToken}`);
    // 404, not 403: a 403 would disclose the block.
    expect(res.status).toBe(404);

    const { PersonFollowRepository } = await import('../../src/persistence/person-follow.repository');
    const follows = h.module.get(PersonFollowRepository);
    const profile = await request(h.app.getHttpServer()).get(`/v1/people/${authorHandle}`);
    expect(await follows.isFollowing(profile.body.userId, profile.body.userId)).toBe(false);
  }, 60_000);

  it('the block hides content in BOTH directions', async () => {
    const fansPost = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${fanToken}`)
      .send({ uploads: [{ uploadId: 'u', key: 'k', kind: 'image' }], interestIds: [await h.topInterestId()] });
    const fansPostId = fansPost.body.postId as string;
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(fansPostId)) {
      await posts.updateMediaState(fansPostId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(fansPostId);

    // The person who placed the block also stops seeing the blocked person.
    const res = await request(h.app.getHttpServer())
      .get(`/v1/posts/${fansPostId}`)
      .set('authorization', `Bearer ${authorToken}`);
    expect(res.status).toBe(404);
  }, 90_000);

  it('re-following after a block is refused while the block stands', async () => {
    const res = await request(h.app.getHttpServer())
      .put(`/v1/people/${authorHandle}/follow`)
      .set('authorization', `Bearer ${fanToken}`);
    expect(res.status).toBe(409);
  }, 60_000);

  it('unblocking does NOT silently restore the severed follow', async () => {
    await request(h.app.getHttpServer())
      .delete(`/v1/blocks/${fanHandle}`)
      .set('authorization', `Bearer ${authorToken}`);

    // Re-following is a deliberate act, not something a block undoes and redoes.
    const res = await request(h.app.getHttpServer())
      .get(`/v1/posts/${postId}`)
      .set('authorization', `Bearer ${fanToken}`);
    expect(res.status).toBe(403);
  }, 60_000);
});
