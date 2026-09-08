import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { MAX_FOLLOWED_INTERESTS } from '../../src/modules/interests/interest-follow.service';

/**
 * US3's acceptance scenarios, per 001/spec.md — REWRITTEN FOR THE RANKED FEED.
 *
 * 001/FR-032 said the home feed is COMPOSED of posts from the interests a
 * person follows. 007 withdrew that (RS-008) and the two scenarios that
 * asserted it directly - "following nothing gives an empty feed", "unfollowing
 * empties it again" - could not survive, because both assert an emptiness a
 * ranked feed never has.
 *
 * They are rewritten rather than deleted, because the PRODUCT question they
 * asked is still live and got a new answer: an interest follow is now a
 * standing declaration that feeds the ranking (007/FR-030). What changed is
 * that it moves a post UP a feed drawn from the whole catalogue, instead of
 * deciding whether the feed contains it at all. Asserting the new answer in the
 * place the old one was asserted is what stops the change being invisible.
 */
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

  it('scenario 2 (007/FR-015): following nothing still yields a POPULATED feed', async () => {
    // Published first, so this asserts the ranked feed reaches a post nobody
    // subscribed to - not that a shared table happened to hold one.
    const orphan = await publishTo(otherTopId);

    const res = await feed();
    expect(res.status).toBe(200);
    // The inverse of what this scenario used to assert, and deliberately so.
    // 001/FR-036's `no_followed_interests` empty state is GONE: a ranked feed
    // is never in that state, and a new account that skips the cold-start picks
    // must still see something (007/FR-015). An empty first screen is the worst
    // first impression the product can make and was the old design's default.
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.page.emptyStateHint).toBeNull();

    // Not asserted: that `orphan` is on THIS page. It competes on recency
    // against everything else in the catalogue, and a test that demanded a
    // specific post from an unweighted feed would be asserting luck.
    expect(typeof orphan).toBe('string');
  }, 90_000);

  it('suggestions are offered when following little (FR-029, SC-006)', async () => {
    const res = await request(h.app.getHttpServer())
      .get('/v1/interests/suggested')
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('scenario 1 (007/FR-030): following an interest raises its posts, and does not gate them', async () => {
    const wanted = await publishTo(topId);
    const unwanted = await publishTo(otherTopId);

    expect((await request(h.app.getHttpServer())
      .put(`/v1/interests/${topId}/follow`)
      .set('authorization', `Bearer ${token}`)).status).toBe(204);

    /**
     * ACROSS SEVERAL REQUESTS, not one, because exploration re-samples every
     * time. A single response is a sample of a random process, and asserting a
     * specific post is on it would be asserting luck - the same mistake as
     * measuring a feedback loop from one page (see explore.spec.ts).
     */
    const pages: string[][] = [];
    for (let i = 0; i < 10; i++) {
      pages.push((await feed()).body.items.map((item: { postId: string }) => item.postId));
    }

    // The declared interest's post is on every page. It is not a sample.
    for (const ids of pages) expect(ids).toContain(wanted);

    /**
     * THE ASSERTION THAT INVERTED, and it is the whole feature in one line.
     *
     * This used to read `expect(ids).not.toContain(unwanted)` - the feed is
     * composed from followed interests ONLY. Under 007 that is false BY DESIGN:
     * the candidate set is drawn across the catalogue, so a post in an
     * undeclared interest is not merely permitted on the page, it must be
     * REACHABLE or the feed could not broaden (FR-007) and a person could never
     * discover anything they had not already named.
     */
    expect(pages.some((ids) => ids.includes(unwanted))).toBe(true);

    /**
     * And where both are present the declaration decides the order. `unwanted`
     * is published AFTER `wanted`, so recency alone would put it first;
     * reversing that is the difference between an interest follow meaning
     * something and meaning nothing (FR-030).
     */
    const both = pages.filter((ids) => ids.includes(wanted) && ids.includes(unwanted));
    expect(both.length).toBeGreaterThan(0);
    for (const ids of both) expect(ids.indexOf(wanted)).toBeLessThan(ids.indexOf(unwanted));
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

  it('scenario 4 (007/FR-030): unfollowing withdraws the declaration from the ranking', async () => {
    // Ensure the follow exists first, for the same reason as scenario 3.
    await request(h.app.getHttpServer())
      .put(`/v1/interests/${topId}/follow`)
      .set('authorization', `Bearer ${token}`);

    const declared = await request(h.app.getHttpServer())
      .get('/v1/me/feed-signals')
      .set('authorization', `Bearer ${token}`);
    expect(declared.status).toBe(200);
    expect(declared.body.interests.map((i: { interestId: string }) => i.interestId)).toContain(topId);

    expect((await request(h.app.getHttpServer())
      .delete(`/v1/interests/${topId}/follow`)
      .set('authorization', `Bearer ${token}`)).status).toBe(204);

    /**
     * Asserted against the DISCLOSURE rather than against the feed's contents.
     *
     * The old assertion - the feed goes empty - is not available and should not
     * be simulated: an unfollowed interest's posts can still appear, through
     * exploration or through behaviour, and that is the design rather than a
     * leak. What must be true is that the declaration is gone from the weights
     * the ranker uses, and FR-011 makes this endpoint the same weights, so this
     * reads the ranker's own state through the product's own surface.
     */
    const after = await request(h.app.getHttpServer())
      .get('/v1/me/feed-signals')
      .set('authorization', `Bearer ${token}`);
    expect(after.body.interests.map((i: { interestId: string }) => i.interestId)).not.toContain(topId);

    // And the feed is still a feed. Unfollowing must not be able to empty it.
    const res = await feed();
    expect(res.body.items.length).toBeGreaterThan(0);
  }, 90_000);

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
