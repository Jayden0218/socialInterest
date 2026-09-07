import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { bootHarness, type Harness } from './harness';

/**
 * 005/US1 over HTTP, against the real datastore.
 *
 * Three properties that a unit test of the arithmetic cannot establish, because
 * each one is about the TRANSACTION rather than the sum:
 *
 *  - replacing a rating does not inflate the count (SC-003, FR-002)
 *  - the aggregate and the rating rows never disagree
 *  - an unrated place reports `average: null`, and a place written before this
 *    feature - with neither counter attribute - reads as unrated rather than NaN
 */
describe('005/US1 — rating a place', () => {
  let h: Harness;
  let token: string;
  let userId: string;
  let placeId: string;

  /**
   * A FRESH CREATOR PER PLACE, and the reason is worth keeping.
   *
   * Creating every place as the same person exhausted FR-046's place-creation
   * limit - capacity 5, refilling at 0.05/s - and the sixth test onward got 429
   * from the SETUP rather than from anything it was testing. The limit is
   * correct and deliberate; the test was wrong to lean on one account for ten
   * places, which is not what ten different people creating places looks like
   * either.
   */
  const makePlace = async (): Promise<string> => {
    const creator = await h.token(await h.createPerson('placemaker'));
    const res = await request(h.app.getHttpServer())
      .post('/v1/places')
      .set('authorization', `Bearer ${creator}`)
      .send({
        // High-entropy, for the reason interest-merge.spec.ts records: a
        // near-duplicate name inside the same locality is correctly refused by
        // the dedupe, and a timestamp suffix makes consecutive names too similar.
        name: `Rating Test ${randomUUID().slice(0, 8)}`,
        category: 'cafe',
        locality: `Locality-${randomUUID().slice(0, 8)}`,
      });
    expect(res.status).toBe(201);
    return res.body.placeId as string;
  };

  beforeAll(async () => {
    h = await bootHarness();
  });

  /**
   * A fresh rater per test as well, for the same reason as the fresh creator.
   *
   * One shared account issuing every PUT across ten tests exhausts the rating
   * limit added in T029 - capacity 10 - and the later tests then get 429 from
   * setup rather than from what they assert. Nobody rates fifteen places in two
   * seconds; the limit is right and the shared identity was not.
   *
   * Tests that need ONE person to rate twice still get that: the identity is
   * shared within a test, just not across them.
   */
  beforeEach(async () => {
    userId = await h.createPerson('rater');
    token = await h.token(userId);
    placeId = await makePlace();
  });

  afterAll(async () => {
    await h.close();
  });

  /** FR-005. `null`, not 0 — and this is the contract, not a display choice. */
  it('an unrated place reports a null average and a zero count, never zero', async () => {
    const res = await request(h.app.getHttpServer()).get(`/v1/places/${placeId}`);
    expect(res.status).toBe(200);
    expect(res.body.ratingSummary).toEqual({ average: null, count: 0 });
    expect(res.body.ratingSummary.average).not.toBe(0);
  });

  it('a first rating moves the average and the count', async () => {
    const put = await request(h.app.getHttpServer())
      .put(`/v1/places/${placeId}/rating`)
      .set('authorization', `Bearer ${token}`)
      .send({ score: 4 });
    expect(put.status).toBe(200);
    expect(put.body.summary).toEqual({ average: 4, count: 1 });

    const read = await request(h.app.getHttpServer()).get(`/v1/places/${placeId}`);
    expect(read.body.ratingSummary).toEqual({ average: 4, count: 1 });
  });

  /**
   * SC-003 and FR-002. THE assertion of this story.
   *
   * The obvious wrong implementation treats every submission as new and inflates
   * both numbers, which nothing on a screen would reveal - the average would just
   * drift wrong over time with no way to tell.
   */
  it('rating twice replaces rather than adds (SC-003)', async () => {
    const server = h.app.getHttpServer();
    await request(server)
      .put(`/v1/places/${placeId}/rating`)
      .set('authorization', `Bearer ${token}`)
      .send({ score: 5 });
    const second = await request(server)
      .put(`/v1/places/${placeId}/rating`)
      .set('authorization', `Bearer ${token}`)
      .send({ score: 2 });

    expect(second.status).toBe(200);
    expect(second.body.summary).toEqual({ average: 2, count: 1 });

    const read = await request(server).get(`/v1/places/${placeId}`);
    expect(read.body.ratingSummary).toEqual({ average: 2, count: 1 });
  });

  /**
   * The aggregate must agree with the rows behind it. This is the check that
   * would catch a replace that added the new score without subtracting the old -
   * the failure the transaction exists to prevent, and one that leaves no trace
   * anywhere else.
   */
  it('the aggregate always agrees with the ratings behind it', async () => {
    const server = h.app.getHttpServer();
    const raters = await Promise.all([h.createPerson('r1'), h.createPerson('r2'), h.createPerson('r3')]);
    const tokens = await Promise.all(raters.map((r) => h.token(r)));
    const scores = [5, 3, 4];

    for (let i = 0; i < raters.length; i++) {
      await request(server)
        .put(`/v1/places/${placeId}/rating`)
        .set('authorization', `Bearer ${tokens[i]}`)
        .send({ score: scores[i] });
    }
    // One rater changes their mind twice.
    await request(server)
      .put(`/v1/places/${placeId}/rating`)
      .set('authorization', `Bearer ${tokens[0]}`)
      .send({ score: 1 });
    await request(server)
      .put(`/v1/places/${placeId}/rating`)
      .set('authorization', `Bearer ${tokens[0]}`)
      .send({ score: 2 });

    const expected = [2, 3, 4];
    const read = await request(server).get(`/v1/places/${placeId}`);
    expect(read.body.ratingSummary.count).toBe(3);
    expect(read.body.ratingSummary.average).toBe(
      Math.round((expected.reduce((a, b) => a + b, 0) / 3) * 10) / 10,
    );
  });

  it('withdrawing recomputes the average without it (FR-003)', async () => {
    const server = h.app.getHttpServer();
    const other = await h.token(await h.createPerson('other'));
    await request(server)
      .put(`/v1/places/${placeId}/rating`)
      .set('authorization', `Bearer ${token}`)
      .send({ score: 5 });
    await request(server)
      .put(`/v1/places/${placeId}/rating`)
      .set('authorization', `Bearer ${other}`)
      .send({ score: 1 });

    const del = await request(server)
      .delete(`/v1/places/${placeId}/rating`)
      .set('authorization', `Bearer ${token}`);
    expect(del.status).toBe(204);

    const read = await request(server).get(`/v1/places/${placeId}`);
    expect(read.body.ratingSummary).toEqual({ average: 1, count: 1 });
  });

  it('withdrawing the last rating returns the place to unrated, not to zero', async () => {
    const server = h.app.getHttpServer();
    await request(server)
      .put(`/v1/places/${placeId}/rating`)
      .set('authorization', `Bearer ${token}`)
      .send({ score: 3 });
    await request(server)
      .delete(`/v1/places/${placeId}/rating`)
      .set('authorization', `Bearer ${token}`);

    const read = await request(server).get(`/v1/places/${placeId}`);
    expect(read.body.ratingSummary).toEqual({ average: null, count: 0 });
  });

  /** FR-006. Reading is public; rating is not. */
  it('refuses an unauthenticated rating and permits an unauthenticated read', async () => {
    const server = h.app.getHttpServer();
    const write = await request(server).put(`/v1/places/${placeId}/rating`).send({ score: 4 });
    expect(write.status).toBe(401);

    const read = await request(server).get(`/v1/places/${placeId}`);
    expect(read.status).toBe(200);
  });

  /**
   * Server-side, per FR-031's general lesson: a constraint enforced only where
   * the well-behaved client passes through is not enforced. A 7 would corrupt
   * this place's average permanently and irreversibly.
   */
  it('refuses a score outside 1..5 and a non-integer, through the raw request', async () => {
    const server = h.app.getHttpServer();
    for (const score of [0, 6, 7, -1, 3.5]) {
      const res = await request(server)
        .put(`/v1/places/${placeId}/rating`)
        .set('authorization', `Bearer ${token}`)
        .send({ score });
      expect([400, 422]).toContain(res.status);
    }
    const read = await request(server).get(`/v1/places/${placeId}`);
    expect(read.body.ratingSummary).toEqual({ average: null, count: 0 });
  });

  it('refuses a rating for a place that does not exist', async () => {
    const res = await request(h.app.getHttpServer())
      .put('/v1/places/NOSUCHPLACE/rating')
      .set('authorization', `Bearer ${token}`)
      .send({ score: 4 });
    expect(res.status).toBe(404);
  });

  /** FR-002 on the read side. */
  it("reports the viewer's own rating so the control renders in the right state", async () => {
    const server = h.app.getHttpServer();
    await request(server)
      .put(`/v1/places/${placeId}/rating`)
      .set('authorization', `Bearer ${token}`)
      .send({ score: 3 });

    const mine = await request(server)
      .get(`/v1/places/${placeId}`)
      .set('authorization', `Bearer ${token}`);
    expect(mine.body.viewerRating).toBe(3);

    const theirs = await request(server).get(`/v1/places/${placeId}`);
    expect(theirs.body.viewerRating).toBeNull();
  });
});
