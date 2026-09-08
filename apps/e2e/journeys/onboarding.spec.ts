import { actor, anonymous } from '../support/client';
import { DataError } from '@sih/mobile/data';
import { publishReadyImage } from '../support/publish';

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

  /**
   * 007/SC-002, T070c — A NEW ACCOUNT REACHES A POPULATED FEED, WITH NO EMPTY
   * STATE ON THE PATH.
   *
   * "Under 60 seconds from first launch" is the criterion; what a test can
   * honestly measure is the second half of it — that every step on the way is
   * populated. A stopwatch here would be timing this machine, and the first
   * half needs a person.
   *
   * The path matters more than the number anyway. An onboarding that reaches a
   * feed in ten seconds THROUGH an empty screen has already told somebody the
   * product is empty, and they do not wait to be corrected.
   */
  it('J-47 a new account reaches a populated feed, past no empty state (SC-002)', async () => {
    const author = await actor('sc002author');
    const tops = await author.data.interests.listTop({ limit: 3 });
    for (const t of tops.items) {
      await publishReadyImage(author, [t.interestId], { caption: `sc002 ${t.slug}` });
    }

    const newcomer = await actor('sc002newcomer');

    // 1. The catalogue is browsable before anything is chosen, or the cold
    //    start has nothing to offer.
    const catalogue = await newcomer.data.interests.listTop({ limit: 30 });
    expect(catalogue.items.length).toBeGreaterThan(0);

    // 2. The cold start has not been answered yet, which is what makes it show.
    const before = await newcomer.data.signals.disclosure();
    expect(before.coldStartComplete).toBe(false);

    // 3. They pick one. A SEED, not a follow (research R4).
    const picked = catalogue.items[0]!;
    await newcomer.data.signals.chooseSeedInterests([picked.interestId]);

    // 4. And the feed is populated on the FIRST request, with no empty state.
    const feed = await newcomer.data.feed.home({ limit: 25 });
    expect(feed.items.length).toBeGreaterThan(0);
    expect(feed.page.emptyStateHint ?? null).toBeNull();
  });

  /**
   * The same path with NOTHING chosen (FR-015), because that is the account the
   * criterion is really about: somebody who declines the question still has to
   * arrive somewhere populated, and it is the path nobody demos.
   */
  it('J-47 the same holds for an account that skips the picks (FR-015)', async () => {
    const author = await actor('sc002skipauthor');
    const tops = await author.data.interests.listTop({ limit: 3 });
    for (const t of tops.items) {
      await publishReadyImage(author, [t.interestId], { caption: `sc002 skip ${t.slug}` });
    }

    const skipper = await actor('sc002skipper');
    // Skipping is an ANSWER and is recorded, or the app asks again forever.
    await skipper.data.signals.chooseSeedInterests([]);
    expect((await skipper.data.signals.disclosure()).coldStartComplete).toBe(true);

    const feed = await skipper.data.feed.home({ limit: 25 });
    expect(feed.items.length).toBeGreaterThan(0);
    expect(feed.page.emptyStateHint ?? null).toBeNull();
  });
});