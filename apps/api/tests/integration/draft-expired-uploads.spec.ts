import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { DraftRepository } from '../../src/persistence/draft.repository';

/**
 * 008/T149, US11 — FR-039. A DRAFT OLDER THAN ITS UPLOADS SAYS SO.
 *
 * The words survive; the pictures may not. An upload target expires, and a
 * draft that quietly restored a caption with no media would look exactly like
 * one that had lost data — which is the worst version of this, because the
 * person cannot tell whether to retype or re-pick.
 *
 * So the restore reports which uploads are gone, and the client says it.
 */
describe('008/US11 a draft whose uploads have expired', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  it('FR-039 restores caption, interest and place, and NAMES the missing media', async () => {
    const author = await h.createPerson('expiredDraft');
    const token = await h.token(author);
    const interestId = await h.topInterestId();

    const saved = await request(server())
      .post('/v1/me/drafts')
      .set('authorization', `Bearer ${token}`)
      .send({
        caption: 'the words are still here',
        interestIds: [interestId],
        uploadIds: [await h.uploadId(token)],
      });
    expect(saved.status).toBe(201);
    const draftId = saved.body.draftId as string;

    /**
     * The upload id is replaced with one the server never issued, which is what
     * an EXPIRED one looks like from the reader's side: the record is gone.
     * Waiting for a real expiry would be a test that sleeps, and 004 recorded
     * four of those going red in CI and green locally.
     */
    const drafts = h.module.get(DraftRepository);
    const stored = await drafts.find(author, draftId);
    await drafts.save({ ...stored!, uploadIds: ['01JZZZZZZZZZZZZZZZZZZZZZZZ'] });

    const restored = await request(server())
      .get(`/v1/me/drafts/${draftId}`)
      .set('authorization', `Bearer ${token}`);

    expect(restored.status).toBe(200);
    expect({
      caption: restored.body.caption,
      interests: restored.body.interestIds,
      // The honest half: the draft SAYS its media is gone rather than returning
      // an id that will fail at publish with a validation error nobody expects.
      missing: restored.body.expiredUploadIds,
      usable: restored.body.uploadIds,
    }).toEqual({
      caption: 'the words are still here',
      interests: [interestId],
      missing: ['01JZZZZZZZZZZZZZZZZZZZZZZZ'],
      usable: [],
    });
  }, 120_000);
});
