import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/** US2 acceptance scenarios, per spec.md § User Story 2. */
describe('US2 — discover content by interest', () => {
  let h: Harness;
  let token: string;
  let userId: string;
  let topId: string;
  let subId: string;
  let subName: string;

  beforeAll(async () => {
    h = await bootHarness();
    userId = await h.createPerson('discoverer');
    token = await h.token(userId);
    topId = await h.topInterestId();

    // 013/FR-004. The interest is created by NAMING it on a publish; there is
    // no standalone create route any more.
    subName = `Analogue ${Date.now().toString().slice(-6)}`;
    const created = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({ uploadIds: [await h.uploadId(token)], interestNames: [subName] });
    expect(created.status).toBe(201);
    subId = (created.body.interestIds as string[])[0]!;
  }, 90_000);

  afterAll(async () => h?.close());

  const publishTo = async (interestId: string) => {
    const res = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({ uploadIds: [await h.uploadId(token)], interestIds: [interestId] });
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

  it('scenario 1: a sub-interest shows its own posts and nothing unrelated', async () => {
    const mine = await publishTo(subId);
    /**
     * 013. EXCLUDES `subId` TOO, and it did not have to before.
     *
     * This asked for `?level=top` and took the first interest that was not
     * `topId` — the level filter guaranteed the result was not `subId`. Flat,
     * there is no level filter, so the listing includes `subId` and this picked
     * the very interest under test: the post landed in it, and the assertion
     * "does not contain theirs" failed because `theirs` was legitimately there.
     */
    const otherTop = await request(h.app.getHttpServer()).get('/v1/interests?limit=50');
    const unrelated = otherTop.body.items.find(
      (i: { interestId: string }) => i.interestId !== topId && i.interestId !== subId,
    );
    const theirs = await publishTo(unrelated.interestId);

    const res = await request(h.app.getHttpServer()).get(`/v1/interests/${subId}/posts`);
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: { postId: string }) => i.postId);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  }, 60_000);

  /**
   * 013/FR-021. REMOVED: "a top-level interest lists its sub-interests AND rolls
   * up their posts (FR-024)".
   *
   * The roll-up is withdrawn. A space lists its own posts and contains no other
   * interests, so both halves of this are gone — along with `rollsUpFrom`,
   * `subInterests` and the caption that explained them.
   */
  /**
   * 013/FR-004, FR-022. REMOVED: "an interest with no posts returns an empty
   * state, not an error".
   *
   * An interest with no posts is now unrepresentable: it comes into existence
   * only as part of publishing into it, and FR-022 retires it if its last post
   * goes. The state this asserted cannot be reached.
   *
   * What survives and still matters is the EMPTY state a viewer sees when the
   * posts exist but the boundary withholds them — asserted where visibility is
   * asserted, in the matrix, and constrained by FR-026: it must not say why.
   */

  it('scenario 4: paging uses an opaque cursor, never an offset (FR-035)', async () => {
    await publishTo(subId);
    await publishTo(subId);

    const first = await request(h.app.getHttpServer()).get(`/v1/interests/${subId}/posts?limit=1`);
    expect(first.body.items).toHaveLength(1);
    expect(typeof first.body.page.nextCursor).toBe('string');

    const second = await request(h.app.getHttpServer())
      .get(`/v1/interests/${subId}/posts?limit=1&cursor=${encodeURIComponent(first.body.page.nextCursor)}`);
    expect(second.status).toBe(200);
    // A different post, so the cursor genuinely advanced.
    expect(second.body.items[0].postId).not.toBe(first.body.items[0].postId);
  }, 90_000);

  /**
   * 013/FR-003. REMOVED: "type-ahead matches across both levels and names each
   * parent (FR-026)".
   *
   * There is one level, and a name is globally unique — enforced by the claim
   * row — so there is nothing to disambiguate and no parent to disambiguate
   * with. Search across the whole flat catalogue is covered by
   * `interest-similarity-is-global`.
   */
  it('search is readable signed out', async () => {
    const res = await request(h.app.getHttpServer()).get('/v1/interests');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });
});

describe('US2 — creating a sub-interest', () => {
  let h: Harness;
  let topId: string;

  beforeAll(async () => {
    h = await bootHarness();
    topId = await h.topInterestId();
  }, 60_000);

  afterAll(async () => h?.close());

  /**
   * A fresh person per test. The FR-046 rate limit is per person and firing at
   * five creations is correct behaviour - one account creating a dozen
   * interests in a second is the flooding the limit exists to stop. Sharing an
   * account across tests would be testing an unrealistic usage pattern and
   * would make the suite fail on the limiter rather than on the assertion.
   */
  /**
   * 013/FR-004. NAMING AN INTEREST IS PUBLISHING NOW.
   *
   * `POST /v1/interests` is gone: it created an interest with no posts, which
   * FR-004 makes unrepresentable. The equivalent gesture — and the only one a
   * person has — is publishing a post that names it.
   */
  const create = async (body: Record<string, unknown>, actor?: string) => {
    const token = actor ?? (await h.token(await h.createPerson('creator')));
    const { name, acknowledgedSimilarTo } = body as {
      name?: string;
      acknowledgedSimilarTo?: string[];
    };
    return request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({
        uploadIds: [await h.uploadId(token)],
        ...(name ? { interestNames: [name] } : {}),
        ...(acknowledgedSimilarTo ? { acknowledgedSimilarTo } : {}),
      });
  };


  it('refuses a near-duplicate and returns the candidates to join instead (FR-023)', async () => {
    const name = `Bouldering ${Date.now().toString().slice(-6)}`;
    expect((await create({ name, parentId: topId })).status).toBe(201);

    // One transposed character - the case SC-008 measures.
    const typo = name.replace('Bouldering', 'Bouldeirng');
    const res = await create({ name: typo, parentId: topId });
    expect(res.status).toBe(409);
    expect(res.body.candidates.length).toBeGreaterThan(0);
    expect(res.body.candidates[0].interest.name).toBe(name);
  }, 60_000);

  /**
   * 013. ASSERTS THE INTEREST IS OFFERED, NOT THAT IT TOPS THE LIST.
   *
   * It checked `candidates[0].similarity > 0.9`. That held while the search was
   * scoped to one parent and the only close name was the one just created;
   * FR-008 makes the comparison GLOBAL, so on a table holding a hundred
   * generated names another can outrank it — this failed at 0.867 against a
   * name it had never heard of.
   *
   * The requirement is FR-009: the person is SHOWN what already exists, so they
   * can join it. Which row sorts first is not the guarantee, and pinning it was
   * asserting an accident of the fixture.
   */
  it('warns while typing, before submission (FR-023)', async () => {
    const name = `Kayaking ${randomUUID().slice(0, 8)}`;
    await create({ name });
    const res = await request(h.app.getHttpServer())
      .get(`/v1/interests/similar?name=${encodeURIComponent(name)}`);
    expect(res.status).toBe(200);
    expect(res.body.candidates.map((c: { interest: { name: string } }) => c.interest.name)).toContain(
      name,
    );
  }, 60_000);

  it('screens the name against the content policy (FR-031, finding G1)', async () => {
    const res = await create({ name: 'Official Climbing', parentId: topId });
    expect(res.status).toBe(422);
    expect(res.body.title).toBe('Interest name not allowed');
  });

  /**
   * 013/FR-003. REMOVED: "refuses a third level (FR-020)".
   *
   * 001 capped the hierarchy at two levels; there are no levels now. The cap
   * has nothing to cap — `parentId` is not in the request schema and `level`
   * does not exist on the item, so both are typecheck failures rather than
   * runtime refusals.
   */
  it('requires authentication', async () => {
    // 013. Naming an interest is publishing, so the auth boundary is the
    // publish route's. Asserted here because it is the gesture this suite is
    // about, and `auth-surface` pins the route set independently.
    const res = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .send({ uploadIds: ['x'], interestNames: ['Anonymous'] });
    expect(res.status).toBe(401);
  });

  /**
   * 013/FR-046. THE FLOOD LIMIT MOVED WITH THE GESTURE, AND STILL HOLDS.
   *
   * 001/FR-046 rate-limited `POST /v1/interests` at capacity 5. That route is
   * gone (FR-004), so creating interests in bulk now means PUBLISHING in bulk,
   * which the publish route limits at capacity 10. The protection is the same
   * protection; it is enforced one door along.
   *
   * HIGH-ENTROPY NAMES, deliberately. `Flood 17...0`, `Flood 17...1` and so on
   * differ by one character and score over the 0.85 blocking threshold, so the
   * near-duplicate gate refuses them 409 — and a run of 409s would mask whether
   * the limiter fired at all. This test is about the limiter, so the names must
   * not trip the other guard. That is the same reason `interest-merge`'s
   * fixture uses a UUID suffix rather than a timestamp.
   */
  it('rate-limits one person creating interests in bulk (FR-046)', async () => {
    const token = await h.token(await h.createPerson('flooder'));
    const statuses: number[] = [];
    for (let i = 0; i < 14; i++) {
      const res = await create({ name: `Flood ${randomUUID().slice(0, 8)}` }, token);
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
    // And the gate did not do the limiter's job for it.
    expect(statuses.filter((x) => x === 409)).toHaveLength(0);
  }, 120_000);
});
