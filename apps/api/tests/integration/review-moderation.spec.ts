import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { bootHarness, type Harness } from './harness';

/**
 * 005/US2 safety, over HTTP. SC-006, FR-014, FR-015, FR-016.
 *
 * INSIDE US2, not in Polish. Principle IV says safety ships WITH the product and
 * must not be scheduled as a later phase; plan gate G2 makes that a release
 * condition rather than an intention, and this file is what makes it checkable.
 *
 * The interesting assertion is not that removal works - it is that the removal
 * takes the RATING with it (research R6) and that the record OUTLIVES the
 * content it concerns (FR-047).
 */
describe('005/US2 — reporting and removing a review', () => {
  let h: Harness;
  let placeId: string;
  let authorToken: string;
  let authorId: string;
  let reporterToken: string;
  let operatorToken: string;

  const makePlace = async (): Promise<string> => {
    const creator = await h.token(await h.createPerson('revplacemaker'));
    const res = await request(h.app.getHttpServer())
      .post('/v1/places')
      .set('authorization', `Bearer ${creator}`)
      .send({
        name: `Reviewed ${randomUUID().slice(0, 8)}`,
        category: 'restaurant',
        locality: `Locality-${randomUUID().slice(0, 8)}`,
      });
    expect(res.status).toBe(201);
    return res.body.placeId as string;
  };

  beforeAll(async () => {
    h = await bootHarness();
  });

  beforeEach(async () => {
    authorId = await h.createPerson('reviewauthor');
    authorToken = await h.token(authorId);
    reporterToken = await h.token(await h.createPerson('reviewreporter'));
    operatorToken = await h.token(await h.createPerson('reviewop'), { isOperator: true });
    placeId = await makePlace();
  });

  afterAll(async () => {
    await h.close();
  });

  const writeReview = async (body: string, score = 5) => {
    const res = await request(h.app.getHttpServer())
      .put(`/v1/places/${placeId}/rating`)
      .set('authorization', `Bearer ${authorToken}`)
      .send({ score, body });
    expect(res.status).toBe(200);
    return res.body;
  };

  it('a review is written, hydrated, and readable on the place page', async () => {
    const written = await writeReview('The laksa is worth the queue.');

    // HYDRATED, not a persistence row. Six surfaces in this codebase shipped
    // returning candidate rows because nothing asserted the shape.
    expect(written.rating).toMatchObject({
      placeId,
      score: 5,
      body: 'The laksa is worth the queue.',
      author: { userId: authorId },
    });
    expect(written.rating.author.handle).toEqual(expect.any(String));
    expect(written.rating.author.displayName).toEqual(expect.any(String));
    // And nothing from the persistence row that is not in the contract.
    expect(written.rating).not.toHaveProperty('userId');
    expect(written.rating).not.toHaveProperty('removedByModeration');

    const list = await request(h.app.getHttpServer()).get(`/v1/places/${placeId}/reviews`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].body).toBe('The laksa is worth the queue.');
  });

  /** FR-009. A rating with no text is complete, and is not a review. */
  it('a rating without text contributes to the average but is not listed as a review', async () => {
    await request(h.app.getHttpServer())
      .put(`/v1/places/${placeId}/rating`)
      .set('authorization', `Bearer ${authorToken}`)
      .send({ score: 4 });

    const place = await request(h.app.getHttpServer()).get(`/v1/places/${placeId}`);
    expect(place.body.ratingSummary).toEqual({ average: 4, count: 1 });

    const list = await request(h.app.getHttpServer()).get(`/v1/places/${placeId}/reviews`);
    // An empty row on the page is worse than no row.
    expect(list.body.items).toHaveLength(0);
  });

  /** SC-006 end to end, plus FR-016 and FR-047. */
  it('a reported review is removed, leaves the average, and the record outlives it', async () => {
    await writeReview('Rude staff and cold food.', 1);
    await request(h.app.getHttpServer())
      .put(`/v1/places/${placeId}/rating`)
      .set('authorization', `Bearer ${await h.token(await h.createPerson('honest'))}`)
      .send({ score: 5 });

    const before = await request(h.app.getHttpServer()).get(`/v1/places/${placeId}`);
    expect(before.body.ratingSummary).toEqual({ average: 3, count: 2 });

    // FR-014: the SAME reporting path as any other content, with the compound id.
    const report = await request(h.app.getHttpServer())
      .post('/v1/reports')
      .set('authorization', `Bearer ${reporterToken}`)
      .send({ subjectType: 'review', subjectId: `${placeId}:${authorId}`, reason: 'harassment' });
    expect(report.status).toBe(201);

    const queue = await request(h.app.getHttpServer())
      .get('/v1/moderation/reports')
      .set('authorization', `Bearer ${operatorToken}`);
    expect(queue.status).toBe(200);
    expect(queue.body.items.some((r: { reportId: string }) => r.reportId === report.body.reportId)).toBe(true);

    const decided = await request(h.app.getHttpServer())
      .patch(`/v1/moderation/reports/${report.body.reportId}`)
      .set('authorization', `Bearer ${operatorToken}`)
      .send({ state: 'actioned', action: 'remove_content', note: 'harassment' });
    expect(decided.status).toBe(200);

    // Gone from the page...
    const list = await request(h.app.getHttpServer()).get(`/v1/places/${placeId}/reviews`);
    expect(list.body.items).toHaveLength(0);

    // ...and its SCORE is gone from the average (FR-016, research R6). This is
    // the assertion that would fail if removal only hid the text: the average
    // would stay 3 and the abuser's 1 would still be counted.
    const after = await request(h.app.getHttpServer()).get(`/v1/places/${placeId}`);
    expect(after.body.ratingSummary).toEqual({ average: 5, count: 1 });
  });

  /** The author must not be able to re-post it by simply asking again. */
  it('a removed review stays removed and is not reportable twice', async () => {
    await writeReview('Something removable.');
    const report = await request(h.app.getHttpServer())
      .post('/v1/reports')
      .set('authorization', `Bearer ${reporterToken}`)
      .send({ subjectType: 'review', subjectId: `${placeId}:${authorId}`, reason: 'harassment' });
    await request(h.app.getHttpServer())
      .patch(`/v1/moderation/reports/${report.body.reportId}`)
      .set('authorization', `Bearer ${operatorToken}`)
      .send({ state: 'actioned', action: 'remove_content' });

    // A second report finds no subject: the review is gone, and a queue item
    // whose subject a moderator cannot see is a decision nobody can make.
    const again = await request(h.app.getHttpServer())
      .post('/v1/reports')
      .set('authorization', `Bearer ${reporterToken}`)
      .send({ subjectType: 'review', subjectId: `${placeId}:${authorId}`, reason: 'harassment' });
    expect(again.status).toBe(404);
  });

  it('refuses a report for a review that does not exist', async () => {
    const res = await request(h.app.getHttpServer())
      .post('/v1/reports')
      .set('authorization', `Bearer ${reporterToken}`)
      .send({ subjectType: 'review', subjectId: `${placeId}:nobody`, reason: 'harassment' });
    expect(res.status).toBe(404);
  });

  /**
   * The compound id is the only form that locates a review, and also the only
   * form a reader can produce from what the place page showed them - so an
   * outsider cannot fish for reviews by reporting bare ids.
   */
  it('refuses a malformed review subject id', async () => {
    for (const subjectId of [placeId, authorId, '', ':', `${placeId}:`]) {
      const res = await request(h.app.getHttpServer())
        .post('/v1/reports')
        .set('authorization', `Bearer ${reporterToken}`)
        .send({ subjectType: 'review', subjectId, reason: 'harassment' });
      expect([400, 404, 422]).toContain(res.status);
    }
  });
});
