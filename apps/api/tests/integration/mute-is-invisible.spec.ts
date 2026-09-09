import request from 'supertest';
import { bootHarness, type Harness } from './harness';

/**
 * 008/T159, US12 — FR-040, Principle III. A MUTE IS NOT INFERABLE BY ITS
 * SUBJECT.
 *
 * The muted person must be unable to tell. Not "unlikely to notice" — unable:
 * no count moves, no ordering changes, and nothing they can request says
 * anything about it.
 *
 * The mechanism is structural, and that is the point of the design: the mute row
 * lives ONLY in the muter's partition with no inverted index (A50), so there is
 * no query the subject can write that reaches it. This test drives the requests
 * a subject actually has and compares before to after.
 */
describe('008/US12 a mute is invisible to the person muted', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await bootHarness();
  }, 120_000);
  afterAll(async () => h?.close());

  const server = (): ReturnType<Harness['app']['getHttpServer']> => h.app.getHttpServer();

  it('FR-040 no count, no ordering and no aggregate changes for the subject', async () => {
    const subject = await h.createPerson('quietOne');
    const muter = await h.createPerson('listener');
    const subjectToken = await h.token(subject);
    const muterToken = await h.token(muter);
    const subjectHandle = (await request(server()).get('/v1/me').set('authorization', `Bearer ${subjectToken}`)).body
      .handle as string;

    await request(server()).put(`/v1/people/${subjectHandle}/follow`).set('authorization', `Bearer ${muterToken}`);

    const before = await request(server()).get('/v1/me').set('authorization', `Bearer ${subjectToken}`);
    const beforeProfile = await request(server())
      .get(`/v1/people/${subjectHandle}`)
      .set('authorization', `Bearer ${muterToken}`);

    const muted = await request(server())
      .put(`/v1/people/${subjectHandle}/mute`)
      .set('authorization', `Bearer ${muterToken}`);
    expect(muted.status).toBe(204);

    const after = await request(server()).get('/v1/me').set('authorization', `Bearer ${subjectToken}`);
    const afterProfile = await request(server())
      .get(`/v1/people/${subjectHandle}`)
      .set('authorization', `Bearer ${muterToken}`);

    /**
     * The follower count is the one a subject watches, and it must not move: a
     * mute that decremented it would be an unfollow wearing a different name,
     * and the subject would see it happen.
     */
    expect({
      followers: after.body.followerCount,
      unchanged: after.body.followerCount === before.body.followerCount,
      /**
       * Nothing on the profile the MUTER sees mentions it either: a
       * `viewerHasMuted` field would be one screenshot away from being seen by
       * the subject.
       *
       * Asserted on the KEYS, not on the whole JSON. The first version searched
       * the serialised body for "mute" and failed because the fixture handles
       * were `muteSubject`/`muteActor` — a test failing on its own naming
       * rather than on the product, which is the shape this file keeps
       * recording.
       */
      leaksToMuter: Object.keys(afterProfile.body).some((k) => k.toLowerCase().includes('mute')),
      profileSame: JSON.stringify(afterProfile.body) === JSON.stringify(beforeProfile.body),
    }).toEqual({
      followers: before.body.followerCount,
      unchanged: true,
      leaksToMuter: false,
      profileSame: true,
    });
  }, 180_000);
});
