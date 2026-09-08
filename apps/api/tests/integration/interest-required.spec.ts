import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * 007/FR-016 AND PLAN GATE G1 — A POST WITHOUT AN INTEREST IS REFUSED, BY THE
 * SERVER.
 *
 * This is the line that keeps Principle I true after 007. The composed feed read
 * the interest graph to decide what to show, so a post with no interest was
 * unreachable and the requirement enforced itself. A ranked feed does not read
 * it that way — it would happily rank an unfiled post — so the ONLY thing still
 * making every post belong somewhere is that publishing refuses without one.
 *
 * Driven over RAW HTTP with a hand-written body, not through the app's data
 * layer. The compose screen disables its own share control until an interest is
 * chosen, and Constitution III is explicit that a guarantee tested only through
 * the first-party client is not tested: the client is the thing an attacker
 * replaces.
 */
describe('FR-016 — publishing without an interest is refused server-side', () => {
  let h: Harness;
  let token: string;
  let interestId: string;

  beforeAll(async () => {
    h = await bootHarness();
    token = await h.token(await h.createPerson('unfiled'));
    interestId = await h.topInterestId();
  }, 120_000);

  afterAll(async () => h?.close());

  const publish = (body: Record<string, unknown>) =>
    request(h.app.getHttpServer())
      .post('/v1/posts')
      .set('authorization', `Bearer ${token}`)
      .send(body);

  it('refuses an empty interest list, and NAMES what is missing', async () => {
    const res = await publish({ uploadIds: [await h.uploadId(token)], interestIds: [] });

    expect(res.status).toBe(422);
    const errors = res.body.errors as { field: string; message: string }[];
    expect(errors.map((e) => e.field)).toContain('interestIds');
    /**
     * The message, not only the status. A publish flow that answers "Validation
     * failed" tells somebody their post was rejected and not what to do about
     * it — and this is the one field a person can actually fix.
     */
    expect(errors.find((e) => e.field === 'interestIds')!.message).toMatch(/interest/i);
  }, 60_000);

  it('refuses a MISSING interest list, which is the shape a stripped client sends', async () => {
    const res = await publish({ uploadIds: [await h.uploadId(token)] });
    expect(res.status).toBe(422);
    expect((res.body.errors as { field: string }[]).map((e) => e.field)).toContain('interestIds');
  }, 60_000);

  it('refuses an interest list of empty strings, which passes a length check', async () => {
    // `[''].length` is 1. A guard that only counted would let this through and
    // file the post under an interest that does not exist.
    const res = await publish({ uploadIds: [await h.uploadId(token)], interestIds: [''] });
    expect(res.status).toBe(422);
  }, 60_000);

  it('refuses UNFILING an existing post through an edit', async () => {
    const created = await publish({
      uploadIds: [await h.uploadId(token)],
      interestIds: [interestId],
    });
    expect(created.status).toBe(201);

    // The other door into the same state, and the one a guard on `create`
    // alone leaves wide open.
    const edited = await request(h.app.getHttpServer())
      .patch(`/v1/posts/${created.body.postId}`)
      .set('authorization', `Bearer ${token}`)
      .send({ interestIds: [] });

    expect(edited.status).toBe(422);
  }, 90_000);

  it('accepts a post that names one', async () => {
    // The inverse, so the four refusals above cannot be a publish endpoint that
    // is simply broken.
    const res = await publish({
      uploadIds: [await h.uploadId(token)],
      interestIds: [interestId],
    });
    expect(res.status).toBe(201);
  }, 60_000);
});
