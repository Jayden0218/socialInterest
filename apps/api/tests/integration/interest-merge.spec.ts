import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { randomUUID } from 'node:crypto';

/**
 * FR-030. The spec's edge cases are explicit that posts must never be orphaned,
 * that reads redirect while a merge runs, and that a merge can be re-run.
 */
describe('FR-030 — interest merge, re-parent and retire', () => {
  let h: Harness;
  let operatorToken: string;
  let userToken: string;
  let topId: string;
  let otherTopId: string;

  const ready = async (postId: string) => {
    const { PostRepository } = await import('../../src/persistence/post.repository');
    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);
  };

  const makeSub = async (name: string) => {
    const res = await request(h.app.getHttpServer())
      .post('/v1/interests')
      .set('authorization', `Bearer ${await h.token(await h.createPerson('subowner'))}`)
      // The suffix must be HIGH-ENTROPY, not merely unique. A timestamp suffix makes
      // consecutive names minimally different - "ParentA 123456" vs "ParentB 123457"
      // scores 0.857, over the 0.85 blocking threshold - so the near-duplicate check
      // (FR-029) correctly refuses the second one with a 409. That made this suite fail
      // only when two calls landed within ~10ms of each other.
      .send({ name: `${name} ${randomUUID().slice(0, 8)}`, parentId: topId });
    expect(res.status).toBe(201);
    return res.body.interestId as string;
  };

  beforeAll(async () => {
    h = await bootHarness();
    operatorToken = await h.token(await h.createPerson('mergeop'), { isOperator: true });
    userToken = await h.token(await h.createPerson('mergeuser'));
    topId = await h.topInterestId();
    const tops = await request(h.app.getHttpServer()).get('/v1/interests?level=top&limit=50');
    otherTopId = tops.body.items.find((i: { interestId: string }) => i.interestId !== topId).interestId;
  }, 120_000);

  afterAll(async () => h?.close());

  it('a merge moves posts AND followers to the survivor, then redirects', async () => {
    const source = await makeSub('Source');
    const target = await makeSub('Target');

    const created = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${userToken}`)
      .send({ uploadIds: [await h.uploadId(userToken)], interestIds: [source] });
    const postId = created.body.postId as string;
    await ready(postId);

    await request(h.app.getHttpServer())
      .put(`/v1/interests/${source}/follow`)
      .set('authorization', `Bearer ${userToken}`);

    const job = await request(h.app.getHttpServer())
      .patch(`/v1/moderation/interests/${source}`)
      .set('authorization', `Bearer ${operatorToken}`)
      .send({ action: 'merge', mergeIntoId: target });
    expect(job.status).toBe(202);

    await new Promise((r) => setTimeout(r, 800));

    // Posts moved: nothing orphaned.
    const onTarget = await request(h.app.getHttpServer()).get(`/v1/interests/${target}/posts?limit=50`);
    expect(onTarget.body.items.map((i: { postId: string }) => i.postId)).toContain(postId);

    // Followers carried across.
    const { InterestFollowRepository } = await import('../../src/persistence/interest-follow.repository');
    const follows = h.module.get(InterestFollowRepository);
    const me = await request(h.app.getHttpServer()).get('/v1/me').set('authorization', `Bearer ${userToken}`);
    expect(await follows.isFollowing(me.body.userId, target)).toBe(true);

    // Reads redirect rather than 404, so existing links keep working.
    const detail = await request(h.app.getHttpServer()).get(`/v1/interests/${source}`);
    expect(detail.status).toBe(301);
    expect(detail.headers.location).toContain(target);
  }, 180_000);

  it('re-running a merge is idempotent, not double-counting', async () => {
    const source = await makeSub('Rerun');
    const target = await makeSub('RerunTarget');
    await request(h.app.getHttpServer())
      .put(`/v1/interests/${source}/follow`)
      .set('authorization', `Bearer ${userToken}`);

    for (let i = 0; i < 2; i++) {
      await request(h.app.getHttpServer())
        .patch(`/v1/moderation/interests/${source}`)
        .set('authorization', `Bearer ${operatorToken}`)
        .send({ action: 'merge', mergeIntoId: target })
        .catch(() => undefined);
      await new Promise((r) => setTimeout(r, 600));
    }

    const targetDetail = await request(h.app.getHttpServer()).get(`/v1/interests/${target}`);
    // A follower moved twice would inflate this; it must not.
    expect(targetDetail.body.followerCount).toBeLessThanOrEqual(2);
  }, 180_000);

  it('retiring a top-level interest with live sub-interests is REFUSED', async () => {
    await makeSub('Living');
    const res = await request(h.app.getHttpServer())
      .patch(`/v1/moderation/interests/${topId}`)
      .set('authorization', `Bearer ${operatorToken}`)
      .send({ action: 'retire' });
    // The spec is explicit that posts must never be orphaned.
    expect(res.status).toBe(409);
    expect(res.body.title).toBe('Would orphan posts');
  }, 120_000);

  it('re-parenting moves a sub-interest beneath a different top-level parent', async () => {
    const sub = await makeSub('Movable');
    const res = await request(h.app.getHttpServer())
      .patch(`/v1/moderation/interests/${sub}`)
      .set('authorization', `Bearer ${operatorToken}`)
      .send({ action: 'reparent', newParentId: otherTopId });
    expect(res.status).toBe(202);
    await new Promise((r) => setTimeout(r, 600));

    const detail = await request(h.app.getHttpServer()).get(`/v1/interests/${sub}`);
    expect(detail.body.parent.interestId).toBe(otherTopId);
  }, 120_000);

  it('re-parenting beneath a SUB-interest is refused (FR-020 still holds)', async () => {
    const a = await makeSub('ParentA');
    const b = await makeSub('ParentB');
    const res = await request(h.app.getHttpServer())
      .patch(`/v1/moderation/interests/${a}`)
      .set('authorization', `Bearer ${operatorToken}`)
      .send({ action: 'reparent', newParentId: b });
    expect(res.status).toBe(422);
  }, 120_000);

  it('interest administration is operator-only', async () => {
    const res = await request(h.app.getHttpServer())
      .patch(`/v1/moderation/interests/${topId}`)
      .set('authorization', `Bearer ${userToken}`)
      .send({ action: 'retire' });
    expect(res.status).toBe(401);
  });
});

/**
 * Regression: a rewrite must land on its NEW key.
 *
 * An item loaded from DynamoDB carries its own pk/sk/gsi attributes. Spreading
 * it over a freshly built key silently wrote back to the OLD location - for a
 * merge that deleted the post outright, and for a re-parent it left the
 * interest indexed under its former parent while its parentId field said
 * otherwise. The field-level assertion above passes either way, which is
 * exactly why this one reads through the INDEX instead.
 */
describe('FR-030 — rewrites land on the new key, not the old one', () => {
  let h: Harness;
  let operatorToken: string;
  let topId: string;
  let otherTopId: string;

  beforeAll(async () => {
    h = await bootHarness();
    operatorToken = await h.token(await h.createPerson('keyop'), { isOperator: true });
    topId = await h.topInterestId();
    const tops = await request(h.app.getHttpServer()).get('/v1/interests?level=top&limit=50');
    otherTopId = tops.body.items.find((i: { interestId: string }) => i.interestId !== topId).interestId;
  }, 90_000);

  afterAll(async () => h?.close());

  it('a re-parented sub-interest is listed under its NEW parent by the index', async () => {
    const owner = await h.token(await h.createPerson('keyowner'));
    const created = await request(h.app.getHttpServer())
      .post('/v1/interests')
      .set('authorization', `Bearer ${owner}`)
      .send({ name: `Reindexed ${Date.now().toString().slice(-6)}`, parentId: topId });
    const subId = created.body.interestId as string;

    await request(h.app.getHttpServer())
      .patch(`/v1/moderation/interests/${subId}`)
      .set('authorization', `Bearer ${operatorToken}`)
      .send({ action: 'reparent', newParentId: otherTopId });
    await new Promise((r) => setTimeout(r, 800));

    // Read through the hierarchy index (gsi3), not the item's own field.
    const { InterestRepository } = await import('../../src/persistence/interest.repository');
    const repo = h.module.get(InterestRepository);
    const newChildren = await repo.listChildren(otherTopId, { limit: 200 });
    const oldChildren = await repo.listChildren(topId, { limit: 200 });
    expect(newChildren.items.map((i) => i.interestId)).toContain(subId);
    expect(oldChildren.items.map((i) => i.interestId)).not.toContain(subId);
  }, 120_000);
});
