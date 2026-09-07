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

    subName = `Analogue ${Date.now().toString().slice(-6)}`;
    const created = await request(h.app.getHttpServer())
      .post('/v1/interests')
      .set('authorization', `Bearer ${token}`)
      .send({ name: subName, parentId: topId });
    expect(created.status).toBe(201);
    subId = created.body.interestId;
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
    const otherTop = await request(h.app.getHttpServer()).get('/v1/interests?level=top&limit=50');
    const unrelated = otherTop.body.items.find((i: { interestId: string }) => i.interestId !== topId);
    const theirs = await publishTo(unrelated.interestId);

    const res = await request(h.app.getHttpServer()).get(`/v1/interests/${subId}/posts`);
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: { postId: string }) => i.postId);
    expect(ids).toContain(mine);
    expect(ids).not.toContain(theirs);
  }, 60_000);

  it('scenario 2: a top-level interest lists its sub-interests AND rolls up their posts (FR-024)', async () => {
    const inSub = await publishTo(subId);

    const detail = await request(h.app.getHttpServer()).get(`/v1/interests/${topId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.subInterests.map((s: { interestId: string }) => s.interestId)).toContain(subId);

    // The roll-up: a post published to the CHILD appears in the PARENT's space.
    const parentPosts = await request(h.app.getHttpServer()).get(`/v1/interests/${topId}/posts`);
    expect(parentPosts.body.items.map((i: { postId: string }) => i.postId)).toContain(inSub);
    expect(parentPosts.body.interest.rollsUpFrom).toContain(subId);
  }, 60_000);

  it('scenario 3: an interest with no posts returns an empty state, not an error', async () => {
    const empty = await request(h.app.getHttpServer())
      .post('/v1/interests')
      .set('authorization', `Bearer ${token}`)
      .send({ name: `Empty ${Date.now().toString().slice(-6)}`, parentId: topId });
    const res = await request(h.app.getHttpServer()).get(`/v1/interests/${empty.body.interestId}/posts`);
    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.page.emptyStateHint).toBe('interest_has_no_posts');
  }, 60_000);

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

  it('scenario 5: type-ahead matches across both levels and names each parent (FR-026)', async () => {
    const partial = subName.slice(0, 5);
    const res = await request(h.app.getHttpServer()).get(`/v1/interests?q=${encodeURIComponent(partial)}`);
    expect(res.status).toBe(200);
    const hit = res.body.items.find((i: { interestId: string }) => i.interestId === subId);
    expect(hit).toBeDefined();
    // Disambiguation: the same name may exist under two parents.
    expect(hit.parent.interestId).toBe(topId);
  });

  it('search is readable signed out', async () => {
    const res = await request(h.app.getHttpServer()).get('/v1/interests?level=top');
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
  const create = async (body: Record<string, unknown>, actor?: string) => {
    const token = actor ?? (await h.token(await h.createPerson('creator')));
    return request(h.app.getHttpServer())
      .post('/v1/interests')
      .set('authorization', `Bearer ${token}`)
      .send(body);
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

  it('warns while typing, before submission (FR-023)', async () => {
    const name = `Kayaking ${Date.now().toString().slice(-6)}`;
    await create({ name, parentId: topId });
    const res = await request(h.app.getHttpServer())
      .get(`/v1/interests/similar?name=${encodeURIComponent(name)}&parentId=${topId}`);
    expect(res.status).toBe(200);
    expect(res.body.candidates[0].similarity).toBeGreaterThan(0.9);
  }, 60_000);

  it('screens the name against the content policy (FR-031, finding G1)', async () => {
    const res = await create({ name: 'Official Climbing', parentId: topId });
    expect(res.status).toBe(422);
    expect(res.body.title).toBe('Interest name not allowed');
  });

  it('refuses a third level (FR-020)', async () => {
    const sub = await create({ name: `Depth ${Date.now().toString().slice(-6)}`, parentId: topId });
    expect(sub.status).toBe(201);
    // Different person, so the refusal is the hierarchy rule and not the limiter.
    const deeper = await create({ name: 'Too deep', parentId: sub.body.interestId });
    expect(deeper.status).toBe(422);
    expect(deeper.body.title).toBe('Interests are only two levels deep');
  }, 60_000);

  it('requires authentication', async () => {
    const res = await request(h.app.getHttpServer())
      .post('/v1/interests')
      .send({ name: 'Anonymous', parentId: topId });
    expect(res.status).toBe(401);
  });

  it('rate-limits one person creating interests in bulk (FR-046)', async () => {
    const token = await h.token(await h.createPerson('flooder'));
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      const res = await create({ name: `Flood ${Date.now()}${i}`, parentId: topId }, token);
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  }, 90_000);
});
