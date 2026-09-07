import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * THE CASE READ-TIME EXPANSION EXISTS FOR.
 *
 * FR-028 says following a top-level interest covers its sub-interests. The
 * tempting implementation writes a follow row per sub-interest at follow time -
 * and then a sub-interest created LATER is invisible to that follower until a
 * back-fill job runs, with a silent window in between.
 *
 * Research D1 chose read-time expansion instead. This test is the difference:
 * follow the parent FIRST, create the sub-interest AFTER, and assert its posts
 * arrive with no back-fill and no refresh of the follow.
 */
describe('FR-028 — a parent follow covers a sub-interest created afterwards', () => {
  let h: Harness;
  let token: string;
  let topId: string;

  beforeAll(async () => {
    h = await bootHarness();
    token = await h.token(await h.createPerson('early'));
    topId = await h.topInterestId();
  }, 90_000);

  afterAll(async () => h?.close());

  it('delivers posts from a sub-interest that did not exist when the follow was made', async () => {
    // 1. Follow the parent. At this moment the sub-interest does not exist.
    expect((await request(h.app.getHttpServer())
      .put(`/v1/interests/${topId}/follow`)
      .set('authorization', `Bearer ${token}`)).status).toBe(204);

    const widthBefore = (await request(h.app.getHttpServer())
      .get('/v1/feed/home')
      .set('authorization', `Bearer ${token}`)).body.meta.fanOutWidth;

    // 2. Someone else creates a sub-interest under it, afterwards.
    const creator = await h.token(await h.createPerson('latecreator'));
    const sub = await request(h.app.getHttpServer())
      .post('/v1/interests')
      .set('authorization', `Bearer ${creator}`)
      .send({ name: `Late ${Date.now().toString().slice(-6)}`, parentId: topId });
    expect(sub.status).toBe(201);
    const subId = sub.body.interestId as string;

    // 3. And publishes to it.
    const author = await h.token(await h.createPerson('lateposter'));
    const created = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${author}`)
      .send({ uploadIds: [await h.uploadId(author)], interestIds: [subId] });
    expect(created.status).toBe(201);
    const postId = created.body.postId as string;

    const { PostRepository } = await import('../../src/persistence/post.repository');
    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);

    // 4. The original follower sees it. No back-fill ran, and they never
    //    re-followed anything.
    const feed = await request(h.app.getHttpServer())
      .get('/v1/feed/home')
      .set('authorization', `Bearer ${token}`);
    expect(feed.body.items.map((i: { postId: string }) => i.postId)).toContain(postId);

    // The fan-in widened by itself, which is the mechanism doing the work.
    expect(feed.body.meta.fanOutWidth).toBeGreaterThan(widthBefore);
  }, 120_000);
});
