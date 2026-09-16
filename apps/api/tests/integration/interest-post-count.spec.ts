import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * 012/FR-032, 013. THE COUNTER THAT HAD NO WRITER.
 *
 * `InterestRepository.incrementPostCount` existed and nothing called it, so
 * every interest reported the literal its creation wrote — 1, for ever. 013
 * found that and routed around it: `retireIfEmpty` counts index ROWS, because
 * "retiring on `postCount === 0` would have retired nothing and looked
 * implemented".
 *
 * 012/FR-032 needs the number to be true: an Explore tile has to convey how much
 * is behind an interest so that choosing one is not guessing, and a count that
 * is 1 everywhere conveys nothing at all.
 *
 * THE ASSERTIONS ARE DELTAS, not absolutes. The local table is shared across
 * runs and four "regressions" in this project have been a grown table; an
 * interest created by this test starts empty, but asserting `toBe(3)` on a
 * SHARED one would be the fifth.
 */
describe('012/FR-032 — an interest counts the posts filed under it', () => {
  let h: Harness;
  let token: string;

  const countOf = async (interestId: string): Promise<number> => {
    const res = await request(h.app.getHttpServer()).get(`/v1/interests/${interestId}`);
    expect(res.status).toBe(200);
    return res.body.postCount as number;
  };

  const publish = async (body: Record<string, unknown>) => {
    const res = await request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send({ uploadIds: [await h.uploadId(token)], ...body });
    expect(res.status).toBe(201);
    return res.body as { postId: string; interests: { interestId: string }[] };
  };

  beforeAll(async () => {
    h = await bootHarness();
    token = await h.token(await h.createPerson('counter'));
  }, 90_000);

  afterAll(async () => h?.close());

  /**
   * A NEW INTEREST IS EXACTLY 1, WHICH IS THE ASSERTION THAT CATCHES THE
   * DOUBLE COUNT.
   *
   * Creation used to write `postCount: 1` as a stand-in for the missing writer.
   * Adding a real increment beside that literal would make every interest's
   * first post count twice — and `toBeGreaterThan(0)` would have passed over
   * it. The row is created at 0 and the same transaction takes it to 1.
   */
  it('an interest created by naming it on a publish counts exactly one post', async () => {
    const created = await publish({ interestNames: [`Counted ${Date.now().toString(36)}`] });
    const interestId = created.interests[0]!.interestId;
    expect(await countOf(interestId)).toBe(1);
  }, 90_000);

  it('goes up with each post, and back down when one is deleted', async () => {
    const created = await publish({ interestNames: [`Tally ${Date.now().toString(36)}`] });
    const interestId = created.interests[0]!.interestId;
    expect(await countOf(interestId)).toBe(1);

    const second = await publish({ interestIds: [interestId] });
    await publish({ interestIds: [interestId] });
    expect(await countOf(interestId)).toBe(3);

    const gone = await request(h.app.getHttpServer())
      .delete(`/v1/posts/${second.postId}`)
      .set('authorization', `Bearer ${token}`);
    expect(gone.status).toBe(204);
    expect(await countOf(interestId)).toBe(2);
  }, 120_000);

  /**
   * NOT VIEWER-FILTERED, AND THAT IS THE STATED POSITION.
   *
   * It counts posts FILED here, not posts this viewer may see — the same class
   * as 005's place rating average, which is "a stated, accepted leak" pinned by
   * a test rather than left to be discovered. Filtering a count per viewer
   * would make it not a count, and would mean a per-viewer scan of every tile
   * on a browse surface.
   *
   * Pinned so that a later change in either direction is a deliberate one.
   */
  it('counts a private post too, which is a stated position rather than an oversight', async () => {
    const created = await publish({ interestNames: [`Quiet ${Date.now().toString(36)}`] });
    const interestId = created.interests[0]!.interestId;
    await publish({ interestIds: [interestId], visibility: 'private' });

    // Anonymous: the boundary shows this viewer one post and the count says two.
    expect(await countOf(interestId)).toBe(2);
    const visible = await request(h.app.getHttpServer()).get(`/v1/interests/${interestId}/posts`);
    expect(visible.body.items.length).toBeLessThan(2);
  }, 120_000);
});
