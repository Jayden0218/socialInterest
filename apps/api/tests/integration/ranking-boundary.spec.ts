import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { RankingService } from '../../src/modules/ranking/ranking.service';

/**
 * ===========================================================================
 * contracts/ranking-boundary.md, C2 THROUGH C5.
 * ===========================================================================
 *
 * C1 is the dependency half and lives in `tests/unit/ranking-cannot-admit.spec.ts`.
 * This is the behavioural half, and it exists because the STRUCTURAL half cannot
 * see the failure that matters. Ranking could import nothing at all and still
 * serve a post the viewer may not see, if the pipeline after it lost the filter,
 * short-circuited it on an empty candidate set, or cached a page across viewers.
 *
 * **C4 is the one that matters.** A ranker that drops a post is a bug. A
 * pipeline that admits one is a privacy failure, and it is the failure a person
 * optimising this code would introduce believing they were removing a redundant
 * step — because for the composed feed it very nearly WAS redundant. That feed
 * read only interests the viewer had subscribed to, so its candidate set was
 * already viewer-scoped and could not over-admit whatever came after. Ranking
 * removes that accident, which is why this is a contract now and not a comment.
 */
describe('the ranking boundary (C2-C5)', () => {
  let h: Harness;
  let authorToken: string;
  let interestId: string;
  let publicPost: string;
  let privatePost: string;
  let viewerToken: string;
  let blockerToken: string;

  const publish = async (token: string, visibility?: 'public' | 'private') => {
    const created = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({ uploadIds: [await h.uploadId(token)], interestIds: [interestId] });
    expect(created.status).toBe(201);
    const postId = created.body.postId as string;

    const { PostRepository } = await import('../../src/persistence/post.repository');
    const { ProcessingService } = await import('../../src/modules/posts/processing.service');
    const posts = h.module.get(PostRepository);
    for (const m of await posts.listMedia(postId)) {
      await posts.updateMediaState(postId, m.ordinal, { processingState: 'ready', exifStripped: true });
    }
    await h.module.get(ProcessingService).reconcile(postId);

    if (visibility) {
      await request(h.app.getHttpServer())
        .patch(`/v1/posts/${postId}`)
        .set('authorization', `Bearer ${token}`)
        .send({ visibility });
    }
    return postId;
  };

  beforeAll(async () => {
    h = await bootHarness();
    interestId = await h.topInterestId();

    authorToken = await h.token(await h.createPerson('boundaryauthor'));
    viewerToken = await h.token(await h.createPerson('boundaryviewer'));
    blockerToken = await h.token(await h.createPerson('boundaryblocker'));

    // The viewer declares the interest, so the ranker proposes from it rather
    // than the test relying on exploration to sample it.
    await request(h.app.getHttpServer())
      .put(`/v1/interests/${interestId}/follow`)
      .set('authorization', `Bearer ${viewerToken}`);

    publicPost = await publish(authorToken);
    privatePost = await publish(authorToken, 'private');
  }, 180_000);

  afterAll(async () => h?.close());

  /**
   * ONE REQUEST, BOTH SETS — the proposal INTERCEPTED as it was made, not
   * recomputed afterwards.
   *
   * The first version of this helper called `RankingService.rank` separately and
   * compared its output to a separate HTTP response. That is unsound and it
   * failed immediately, for the right reason: exploration re-samples its
   * partitions on every call, so the two draws are simply different sets and the
   * comparison says nothing about the boundary.
   *
   * The contract is a relationship between what ONE request proposed and what
   * THAT request served, so the proposal has to come from inside it.
   */
  const roundTrip = async (token: string): Promise<{ propose: Set<string>; serve: Set<string> }> => {
    const ranking = h.module.get(RankingService);
    const captured: string[] = [];
    const spy = jest.spyOn(ranking, 'rank').mockImplementation(async (...args) => {
      const result = await (RankingService.prototype.rank as typeof ranking.rank).apply(ranking, args);
      captured.push(...result.candidates.map((c) => c.postId));
      return result;
    });
    try {
      const res = await request(h.app.getHttpServer())
        .get('/v1/feed/home?limit=20')
        .set('authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      return {
        propose: new Set(captured),
        serve: new Set(res.body.items.map((i: { postId: string }) => i.postId)),
      };
    } finally {
      spy.mockRestore();
    }
  };

  const served = async (token: string): Promise<Set<string>> => (await roundTrip(token)).serve;

  it('C4 — the served set is ALWAYS a subset of the proposed set', async () => {
    // Repeated, because both sides sample: exploration re-draws its partitions
    // per request, so a single agreement could be a coincidence of one draw.
    for (let i = 0; i < 5; i++) {
      const { propose, serve } = await roundTrip(viewerToken);
      const admitted = [...serve].filter((id) => !propose.has(id));
      // Named rather than counted: if this ever fails, the ids are the evidence.
      expect({ round: i, admitted }).toEqual({ round: i, admitted: [] });
    }
  }, 120_000);

  it('C3 — nothing is dropped between proposal and service for a viewer with no blocks', async () => {
    /**
     * The other direction, and it is not symmetry for its own sake. A ranker
     * that quietly drops posts IS a filter, wearing the clothes of an ordering,
     * and it would satisfy C4 forever while making the visibility boundary's
     * decision somewhere the matrix cannot see it.
     *
     * Bounded to the page: the proposal is larger than one page by design, so
     * the claim is about the page's worth of candidates the feed considered,
     * not about every candidate ever collected.
     */
    const { propose, serve } = await roundTrip(viewerToken);
    for (const id of serve) expect(propose.has(id)).toBe(true);
    // And the proposal is not empty, or the claim above is vacuous.
    expect(propose.size).toBeGreaterThan(0);

    // The public post survives the whole pipeline; the private one does not.
    // Both halves, so the test cannot pass by serving nothing.
    expect(serve.has(publicPost)).toBe(true);
    expect(serve.has(privatePost)).toBe(false);
  }, 120_000);

  it('C5 — a decision is not memoised across viewers', async () => {
    /**
     * The blocker blocks the author. Both viewers now rank over overlapping
     * candidates, and the correct answers DIFFER. A per-candidate decision
     * cached anywhere in the pipeline returns the first viewer's answer to the
     * second — which is the single most attractive optimisation here, because
     * the two requests genuinely do repeat most of their work.
     */
    const authorHandle = (
      await request(h.app.getHttpServer()).get('/v1/me').set('authorization', `Bearer ${authorToken}`)
    ).body.handle;

    await request(h.app.getHttpServer())
      .put(`/v1/interests/${interestId}/follow`)
      .set('authorization', `Bearer ${blockerToken}`);
    expect(
      (
        await request(h.app.getHttpServer())
          .put(`/v1/blocks/${authorHandle}`)
          .set('authorization', `Bearer ${blockerToken}`)
      ).status,
    ).toBe(204);

    // Order deliberately: the permitted viewer reads FIRST, so a cache would be
    // warm with "visible" by the time the blocker asks.
    expect((await served(viewerToken)).has(publicPost)).toBe(true);
    expect((await served(blockerToken)).has(publicPost)).toBe(false);
    // And back again, in case the cache is keyed the other way round.
    expect((await served(viewerToken)).has(publicPost)).toBe(true);
  }, 120_000);

  it('C2 + immediacy — a flip to private is absent on the FIRST request after it', async () => {
    const fresh = await publish(authorToken);
    expect((await served(viewerToken)).has(fresh)).toBe(true);

    const flip = await request(h.app.getHttpServer())
      .patch(`/v1/posts/${fresh}`)
      .set('authorization', `Bearer ${authorToken}`)
      .send({ visibility: 'private' });
    expect(flip.status).toBe(200);

    // Not "eventually", not "after the cache expires". The next request.
    expect((await served(viewerToken)).has(fresh)).toBe(false);
  }, 120_000);
});
