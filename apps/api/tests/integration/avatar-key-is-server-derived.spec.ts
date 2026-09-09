import request from 'supertest';
import { bootHarness, type Harness } from './harness';
import { PersonRepository } from '../../src/persistence/person.repository';

/**
 * 008/T073, FR-017 — THE SERVER DERIVES THE AVATAR KEY FROM ITS OWN RECORD.
 *
 * 002's second defect was the server trusting a CLIENT-SUPPLIED media key, which
 * let a post point at another person's media. Uploads are persisted and the
 * server reads key and kind from its own record for posts; the avatar path is
 * new and must not reintroduce the hole.
 *
 * Driven directly, per Principle III: a guarantee tested only through the
 * well-behaved first-party client is not tested at all — and the first-party
 * client would never send these bodies.
 */
describe('008/FR-017 the avatar key is server-derived', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();
  const patch = async (token: string, body: object): Promise<request.Response> =>
    request(server()).patch('/v1/me').set('authorization', `Bearer ${token}`).send(body);

  it('sets the avatar from an upload the caller owns', async () => {
    const person = await h.createPerson('avatarOwner');
    const token = await h.token(person);
    const uploadId = await h.uploadId(token);

    const res = await patch(token, { avatarUploadId: uploadId });
    expect(res.status).toBe(200);
    expect(typeof res.body.avatarUrl).toBe('string');

    const stored = await h.module.get(PersonRepository).findById(person);
    // The stored value is the KEY. What a client receives is a presigned url
    // derived from it, and the two must not be the same string - that was
    // exactly the shipped defect.
    expect({ key: stored?.avatarKey, keyIsUrl: String(stored?.avatarKey).startsWith('http') })
      .toMatchObject({ keyIsUrl: false });
    expect(res.body.avatarUrl).not.toBe(stored?.avatarKey);
  }, 120_000);

  it('REFUSES an upload issued to somebody else', async () => {
    const mine = await h.createPerson('avatarThief');
    const theirs = await h.createPerson('avatarVictim');
    const theirUpload = await h.uploadId(await h.token(theirs));

    const res = await patch(await h.token(mine), { avatarUploadId: theirUpload });
    // 404, not 403: the caller learns nothing about whether that id exists.
    expect(res.status).toBe(404);
    expect((await h.module.get(PersonRepository).findById(mine))?.avatarKey).toBeUndefined();
  }, 120_000);

  it('REJECTS a client-supplied key outright, rather than ignoring it', async () => {
    const person = await h.createPerson('avatarKeySender');
    const token = await h.token(person);

    // The shape 002's defect accepted. It must not be a way in.
    const res = await patch(token, { avatarKey: 'media/someone-else/original.jpg' });

    /**
     * 422, and this test originally expected 200-and-ignored.
     *
     * The schema is `.strict()`, so an unknown field is refused rather than
     * dropped — which is the STRONGER of the two behaviours and the one worth
     * pinning. A client that sent a key and got 200 would reasonably believe it
     * had set an avatar; being told is better than being quietly overruled, and
     * a silent drop is also how a real field lands in a schema that never
     * declared it and nobody notices.
     */
    expect(res.status).toBe(422);
    expect((await h.module.get(PersonRepository).findById(person))?.avatarKey).toBeUndefined();
  }, 120_000);

  it('removes the avatar on an explicit null, and leaves it alone when absent', async () => {
    const person = await h.createPerson('avatarRemover');
    const token = await h.token(person);
    await patch(token, { avatarUploadId: await h.uploadId(token) });
    expect((await h.module.get(PersonRepository).findById(person))?.avatarKey).toBeTruthy();

    // Absent: unchanged. This is the case that would break if `undefined` and
    // `null` were treated alike - every unrelated profile edit would clear it.
    await patch(token, { displayName: 'Still Has A Face' });
    expect((await h.module.get(PersonRepository).findById(person))?.avatarKey).toBeTruthy();

    await patch(token, { avatarUploadId: null });
    const after = await h.module.get(PersonRepository).findById(person);
    expect({ key: after?.avatarKey ?? null, name: after?.displayName })
      .toEqual({ key: null, name: 'Still Has A Face' });
  }, 120_000);

  it('refuses a VIDEO upload — an avatar goes through the image path (FR-018)', async () => {
    const person = await h.createPerson('avatarVideo');
    const token = await h.token(person);
    const videoUpload = await h.uploadId(token, 'video');

    const res = await patch(token, { avatarUploadId: videoUpload });
    expect(res.status).toBe(409);
  }, 120_000);
});
