import { actor, anonymous } from '../support/client';
import { DataError } from '@sih/mobile/data';

describe('core journeys - onboarding', () => {
  it('J-01 signs in and makes an authenticated request', async () => {
    const me = await actor('signin');
    const profile = await me.data.session.me();
    expect(profile.userId).toBe(me.userId);
    expect(profile.handle).toBe(me.handle);
  });

  it('J-01 a signed-out app cannot read the signed-in profile', async () => {
    await expect(anonymous().session.me()).rejects.toMatchObject({ status: 401 });
  });

  it('J-02 browses the interest catalogue', async () => {
    const me = await actor('browse');
    const page = await me.data.interests.listTop({ limit: 10 });
    expect(page.items.length).toBeGreaterThan(0);
    // The seeded catalogue, not an empty shell that would make every later
    // journey vacuous.
    expect(page.items[0]).toHaveProperty('interestId');
    expect(page.items[0]).toHaveProperty('name');
  });

  it('J-02 a bad token is refused rather than treated as anonymous', async () => {
    const me = await actor('badtoken');
    await me.data.client.tokens.set('not-a-jwt');
    const err = await me.data.session.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DataError);
    expect((err as DataError).status).toBe(401);
  });
});
