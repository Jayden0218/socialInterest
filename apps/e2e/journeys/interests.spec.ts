import { actor } from '../support/client';

describe('core journeys - interests', () => {
  it('J-03 follows an interest and it persists', async () => {
    const me = await actor('follower');
    const top = await me.data.interests.listTop({ limit: 1 });
    const interest = top.items[0]!;

    await me.data.interests.follow(interest.interestId);

    // Read it back through a separate request - an in-memory success would prove
    // nothing about what the server stored.
    const profile = await me.data.session.me();
    expect(profile.interestFollowCount).toBeGreaterThan(0);

    await me.data.interests.unfollow(interest.interestId);
    const after = await me.data.session.me();
    expect(after.interestFollowCount).toBe(profile.interestFollowCount - 1);
  });
});
