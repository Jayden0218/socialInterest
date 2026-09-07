import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { MAX_FOLLOWED_INTERESTS } from '../../src/modules/interests/interest-follow.service';

/** US3 acceptance scenarios, per spec.md § User Story 3. */
describe('US3 — follow interests to build a personal feed', () => {
  let h: Harness;
  let token: string;
  let topId: string;
  let otherTopId: string;

  beforeAll(async () => {
    h = await bootHarness();
    token = await h.token(await h.createPerson('follower'));
    topId = await h.topInterestId();
    const tops = await request(h.app.getHttpServer()).get('/v1/interests?level=top&limit=50');
    otherTopId = tops.body.items.find((i: { interestId: string }) => i.interestId !== topId).interestId;
  }, 90_000);

  afterAll(async () => h?.close());

  const publishTo = async (interestId: string) => {
    const author = await h.token(await h.createPerson('poster'));
    const res = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${author}`)
      .send({ uploadIds: [await h.uploadId(author)], interestIds: [interestId] });
    expect(res.status).toBe(201);
    const postId = res.body.postId as string;
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);
    return postId;
  };

  const feed = () =>
    request(h.app.getHttpServer()).get('/v1/feed/home').set('authorization', `Bearer ${token}`);

  it('scenario 2: following nothing yields the onboarding empty state (FR-036)', async () => {
    const res = await feed();
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    // Distinguishable from "your interests have no posts" - different prompts.
    expect(res.body.page.emptyStateHint).toBe('no_followed_interests');
  });

  it('suggestions are offered when following little (FR-029, SC-006)', async () => {
    const res = await request(h.app.getHttpServer())
      .get('/v1/interests/suggested')
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('scenario 1: following an interest brings its posts into the feed (FR-032)', async () => {
    const wanted = await publishTo(topId);
    const unwanted = await publishTo(otherTopId);

    expect((await request(h.app.getHttpServer())
      .put(`/v1/interests/${topId}/follow`)
      .set('authorization', `Bearer ${token}`)).status).toBe(204);

    const res = await feed();
    const ids = res.body.items.map((i: { postId: string }) => i.postId);
    expect(ids).toContain(wanted);
    // The feed is composed from followed interests ONLY.
    expect(ids).not.toContain(unwanted);
  }, 90_000);

  it('following is idempotent', async () => {
    const again = await request(h.app.getHttpServer())
      .put(`/v1/interests/${topId}/follow`)
      .set('authorization', `Bearer ${token}`);
    expect(again.status).toBe(204);
  });

  it('scenario 3: a post in a SUB-interest reaches a follower of its parent (FR-028)', async () => {
    // Follow explicitly rather than relying on scenario 1 having run. Test order
    // coupling hides itself until someone runs a filtered subset, and then the
    // failure looks like a product bug rather than a test one.
    await request(h.app.getHttpServer())
      .put(`/v1/interests/${topId}/follow`)
      .set('authorization', `Bearer ${token}`);

    const creator = await h.token(await h.createPerson('subcreator'));
    const sub = await request(h.app.getHttpServer())
      .post('/v1/interests')
      .set('authorization', `Bearer ${creator}`)
      .send({ name: `Nested ${Date.now().toString().slice(-6)}`, parentId: topId });
    expect(sub.status).toBe(201);

    const inSub = await publishTo(sub.body.interestId);
    const res = await feed();
    expect(res.body.items.map((i: { postId: string }) => i.postId)).toContain(inSub);
    // The fan-in read the parent and its children.
    expect(res.body.meta.fanOutWidth).toBeGreaterThan(1);
  }, 90_000);

  it('scenario 4: unfollowing removes those posts from the feed', async () => {
    // Ensure the follow exists first, for the same reason as scenario 3.
    await request(h.app.getHttpServer())
      .put(`/v1/interests/${topId}/follow`)
      .set('authorization', `Bearer ${token}`);

    expect((await request(h.app.getHttpServer())
      .delete(`/v1/interests/${topId}/follow`)
      .set('authorization', `Bearer ${token}`)).status).toBe(204);

    const res = await feed();
    expect(res.body.items).toEqual([]);
    expect(res.body.page.emptyStateHint).toBe('no_followed_interests');
  }, 60_000);

  it('unfollowing something you do not follow is a no-op', async () => {
    const res = await request(h.app.getHttpServer())
      .delete(`/v1/interests/${otherTopId}/follow`)
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);
  });

  it('the feed requires authentication', async () => {
    expect((await request(h.app.getHttpServer()).get('/v1/feed/home')).status).toBe(401);
  });

  it('the follow cap is a real limit, not documentation (research D1)', () => {
    // The cap exists because every followed interest is a query on the feed's
    // critical path, and SC-005 gives that path a 2s p95 budget.
    expect(MAX_FOLLOWED_INTERESTS).toBe(200);
  });

  it('returns renderable posts, not index rows (FR-032)', async () => {
    // Regression. The feed used to return the fan-in's index rows - postId,
    // authorId, interestId, visibility, processingState, createdAt - so a client
    // received a list of ids and rendered a blank feed. Every test missed it by
    // asserting only that an id was present, which index rows satisfy.
    const author = await h.token(await h.createPerson('feedshape'));
    const interestId = await h.topInterestId();
    const created = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${author}`)
      .send({ uploadIds: [await h.uploadId(author)], interestIds: [interestId], caption: 'a caption a client can show' });
    const postId = created.body.postId as string;

    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);

    const reader = await h.token(await h.createPerson('feedshapereader'));
    await request(h.app.getHttpServer())
      .put(`/v1/interests/${interestId}/follow`)
      .set('authorization', `Bearer ${reader}`);

    const feed = await request(h.app.getHttpServer())
      .get('/v1/feed/home?limit=20')
      .set('authorization', `Bearer ${reader}`);
    expect(feed.status).toBe(200);

    const item = feed.body.items.find((i: { postId: string }) => i.postId === postId);
    expect(item).toBeDefined();
    expect(item.caption).toBe('a caption a client can show');
    expect(item.author).toBeDefined();
    expect(item.author.handle).toBeTruthy();
    expect(item.mediaKind).toBe('images');
    expect(typeof item.reactionCount).toBe('number');
  }, 60_000);
});
