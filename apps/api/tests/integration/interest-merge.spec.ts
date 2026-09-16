import request from 'supertest';
import { eventually } from './eventually';
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

    /**
     * WAIT FOR THE JOB'S LAST STEP, THEN ASSERT EVERYTHING.
     *
     * apps/workers/src/interest-jobs/handler.ts runs: mark merging -> move
     * posts -> move followers -> setMergedInto. Only the last of those makes
     * GET /interests/{source} answer 301, so the redirect IS the completion
     * signal, and nothing that happened earlier can still be in flight once it
     * appears.
     *
     * A previous fix here waited on the POST move and then asserted the
     * FOLLOWER move immediately - which is a step later in the same job. It
     * turned one race into a different one and went red in CI on the very next
     * run. The lesson is the one this project keeps relearning: read the thing
     * that already works before deciding what to wait for.
     */
    await eventually(
      () => request(h.app.getHttpServer()).get(`/v1/interests/${source}`),
      (r) => r.status === 301,
      { describe: 'the merge job completing (its final step is the redirect)' },
    );

    // Posts moved: nothing orphaned.
    const onTarget = await request(h.app.getHttpServer()).get(`/v1/interests/${target}/posts?limit=50`);
    expect(onTarget.body.items.map((i: { postId: string }) => i.postId)).toContain(postId);

    // Followers carried across.
    const { InterestFollowRepository } = await import('../../src/persistence/interest-follow.repository');
    const follows = h.module.get(InterestFollowRepository);
    const me = await request(h.app.getHttpServer()).get('/v1/me').set('authorization', `Bearer ${userToken}`);
    expect(await follows.isFollowing(me.body.userId, target)).toBe(true);

    // And the redirect points at the survivor.
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
      await eventually(
        () => request(h.app.getHttpServer()).get(`/v1/interests/${source}`),
        (r) => r.status === 301,
        { describe: `merge ${i + 1} completing` },
      );
    }

    const targetDetail = await request(h.app.getHttpServer()).get(`/v1/interests/${target}`);
    // A follower moved twice would inflate this; it must not.
    expect(targetDetail.body.followerCount).toBeLessThanOrEqual(2);
  }, 180_000);

  /**
   * 013/FR-022. REMOVED: "retiring a top-level interest with live sub-interests
   * is REFUSED".
   *
   * The refusal existed so a retirement could not orphan a child's posts.
   * Interests are flat, so nothing can be orphaned that way — and what a
   * retirement must not orphan now is the interest's OWN posts, which the
   * controller refuses on `postCount > 0`. The guard moved rather than went.
   */

  /**
   * 013. THE RE-PARENTING TEST IS GONE, because re-parenting is gone.
   *
   * It moved a sub-interest beneath a different top-level parent and read the
   * result back through the hierarchy index. Interests are flat: there is no
   * parent to move, no `reparent` action, and no `PARENT#` index — all three
   * were deleted together rather than left as an unreachable branch.
   *
   * Removed rather than inverted, unlike the colour and byline assertions,
   * because there is no residual behaviour to pin: the operator route now
   * refuses the action outright, which `auth-surface`'s operator snapshot
   * covers.
   */
});
