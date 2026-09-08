import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * A SUB-INTEREST CREATED AFTER THE FACT STILL REACHES THE PARENT'S READERS.
 *
 * FR-028 says following a top-level interest covers its sub-interests. The
 * tempting implementation writes a follow row per sub-interest at follow time -
 * and then a sub-interest created LATER is invisible until a back-fill job
 * runs, with a silent window in between.
 *
 * 007 CHANGED WHICH MECHANISM DELIVERS THIS, and the test moved with it.
 *
 * The composed feed expanded a parent follow into its children at READ time,
 * and this test asserted that by watching the fan-in widen. That expansion is
 * deleted with the composed feed. What remains is the one that was always
 * underneath it: 001/FR-024 indexes a post under its sub-interest AND its
 * parent at WRITE time, so the parent partition already contains it.
 *
 * That is a stronger guarantee, not a weaker one - it holds for every surface
 * that reads the parent partition rather than only for the feed - so the
 * assertion below is now about the delivery and about the partition, and no
 * longer about a fan-in width that a ranked feed sets from the page size.
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

    /**
     * AND THE MECHANISM, asserted directly rather than inferred from the feed.
     *
     * The post is in the PARENT's partition, written there when it was
     * published. Without this the test above could pass through exploration -
     * the ranked feed samples interests the viewer has not declared - and would
     * then be asserting luck while reading like a proof of FR-028.
     */
    const { PostInterestIndexRepository } = await import(
      '../../src/persistence/post-interest-index.repository'
    );
    const parentPartition = await h.module
      .get(PostInterestIndexRepository)
      .listByInterest(topId, { limit: 5 });
    expect(parentPartition.items.map((i) => i.postId)).toContain(postId);

    // And under its own sub-interest, so browsing the sub-interest works too.
    const subPartition = await h.module
      .get(PostInterestIndexRepository)
      .listByInterest(subId, { limit: 5 });
    expect(subPartition.items.map((i) => i.postId)).toContain(postId);
  }, 120_000);
});
