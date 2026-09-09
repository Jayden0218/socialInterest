import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * 008/T148, US11 — FR-038, SC-015. A DRAFT IS VISIBLE TO NOBODY ELSE.
 *
 * Driven DIRECTLY with another person's draft id, because that is the request a
 * modified client sends and the app's own screens prove nothing about it
 * (Principle III). The guarantee is structural — a draft lives in its owner's
 * partition under no index (A49) — and this is the test that the structure was
 * actually used rather than described.
 */
describe('008/US11 a draft is private to its author', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  it('FR-038 another person cannot read or delete it, by id', async () => {
    const author = await h.createPerson('draftOwner');
    const stranger = await h.createPerson('draftStranger');
    const authorToken = await h.token(author);
    const strangerToken = await h.token(stranger);

    const saved = await request(server())
      .post('/v1/me/drafts')
      .set('authorization', `Bearer ${authorToken}`)
      .send({
        caption: 'something I have not finished',
        interestIds: [await h.topInterestId()],
        uploadIds: [await h.uploadId(authorToken)],
      });
    expect({ step: 'save', status: saved.status }).toEqual({ step: 'save', status: 201 });
    const draftId = saved.body.draftId as string;

    const read = await request(server())
      .get(`/v1/me/drafts/${draftId}`)
      .set('authorization', `Bearer ${strangerToken}`);
    const removed = await request(server())
      .delete(`/v1/me/drafts/${draftId}`)
      .set('authorization', `Bearer ${strangerToken}`);
    const listed = await request(server())
      .get('/v1/me/drafts')
      .set('authorization', `Bearer ${strangerToken}`);

    /**
     * 404 rather than 403, and that is the RIGHT answer here where it was the
     * wrong one for a comment: a comment on a public post is readable, so
     * denying its existence is a lie the caller can disprove. A draft's very
     * existence is the private part.
     */
    expect({
      read: read.status,
      removed: removed.status,
      inTheirList: listed.body.items.length,
    }).toEqual({ read: 404, removed: 404, inTheirList: 0 });

    // And it is still there for its owner: the stranger's DELETE must not have
    // removed it, which a shared-key implementation would have allowed.
    const mine = await request(server())
      .get(`/v1/me/drafts/${draftId}`)
      .set('authorization', `Bearer ${authorToken}`);
    expect(mine.status).toBe(200);
  }, 120_000);
});
