import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * 007/US1 AND US2, THROUGH THE APP'S OWN DATA LAYER.
 *
 * The point of this suite, since 002: both sides generated from one document
 * agree with each other by construction, so a contract test and a generated
 * client cannot catch a defect in how the APP builds its requests. Only a
 * request can. Every call below goes through `apps/mobile/src/data`.
 *
 * What this asserts that the API's own integration tests cannot: that the app's
 * signals layer, disclosure and reset actually reach the endpoints they think
 * they do, and that a session driven the way a person drives it moves the
 * profile the ranker reads.
 */
describe('core journeys - signals and the ranked feed', () => {
  it('J-42 a session moves the profile the ranker reads', async () => {
    const author = await actor('signalauthor');
    const reader = await actor('signalreader');
    const tops = await reader.data.interests.listTop({ limit: 2 });
    const engaged = tops.items[0]!;
    const ignored = tops.items[1]!;

    const engagedPost = await publishReadyImage(author, [engaged.interestId], { caption: 'engaged with' });
    await publishReadyImage(author, [ignored.interestId], { caption: 'ignored' });

    const before = await reader.data.signals.disclosure();
    expect(before.interests.map((i) => i.interestId)).not.toContain(engaged.interestId);

    const receipt = await reader.data.signals.record([
      { kind: 'open', postId: engagedPost },
      { kind: 'dwell', postId: engagedPost, dwellMs: 20_000 },
      { kind: 'save', postId: engagedPost },
    ]);
    expect(receipt).toEqual({ accepted: 3, rejected: 0 });

    const after = await reader.data.signals.disclosure();
    expect(after.interests.map((i) => i.interestId)).toContain(engaged.interestId);
    // And NOT the one they scrolled past. A disclosure that listed everything
    // would look informative and say nothing.
    expect(after.interests.map((i) => i.interestId)).not.toContain(ignored.interestId);
  });

  it('J-43 the disclosure and the reset are reachable and real (FR-011, FR-012)', async () => {
    const author = await actor('resetauthor');
    const reader = await actor('resetreader');
    const interest = (await reader.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'to be forgotten' });

    await reader.data.signals.record([{ kind: 'save', postId }]);
    const learned = await reader.data.signals.disclosure();
    expect(learned.interests.length).toBeGreaterThan(0);
    // In the person's own terms, not the ranker's. An explanation nobody can
    // read is not a disclosure.
    expect(learned.collected.length).toBeGreaterThan(0);

    expect(await reader.data.signals.clear()).toEqual({ cleared: true });

    const after = await reader.data.signals.disclosure();
    expect(after.interests).toEqual([]);
  });

  it('J-44 the cold-start picks are a seed and NOT a follow (FR-014, research R4)', async () => {
    const reader = await actor('seedreader');
    const interest = (await reader.data.interests.listTop({ limit: 1 })).items[0]!;

    const stored = await reader.data.signals.chooseSeedInterests([interest.interestId]);
    expect(stored.seedInterests).toEqual([interest.interestId]);

    /**
     * THE ASSERTION THAT MATTERS, and it is invisible on any screen: the pick
     * did not create an interest follow. Storing seeds as follows is the easy
     * path and would quietly recreate the subscription feed 007 removes,
     * because every later reader treats a follow as a follow.
     */
    const detail = await reader.data.interests.get(interest.interestId);
    expect(detail.viewerIsFollowing ?? false).toBe(false);

    // And it does reach the ranking, or the seed would be decoration.
    const disclosure = await reader.data.signals.disclosure();
    expect(disclosure.seedInterests).toEqual([interest.interestId]);
    expect(disclosure.interests.map((i) => i.interestId)).toContain(interest.interestId);
  });

  it('J-45 an account that picked nothing still gets a feed (FR-015)', async () => {
    const author = await actor('coldauthor');
    const newcomer = await actor('coldnewcomer');
    const tops = await author.data.interests.listTop({ limit: 3 });
    for (const t of tops.items) {
      await publishReadyImage(author, [t.interestId], { caption: `cold ${t.slug}` });
    }

    // No seeds, no follows, no behaviour. The worst case for a ranked feed and
    // the first impression the product makes.
    const feed = await newcomer.data.feed.home({ limit: 25 });
    expect(feed.items.length).toBeGreaterThan(0);
    expect(feed.page.emptyStateHint ?? null).toBeNull();
  });

  /**
   * FR-008, AND THE DEFECT THIS FOUND.
   *
   * Writing it exposed that the mobile data layer declared `nextCursor` at the
   * top level while every endpoint nests it under `page` — so `usePaged` read
   * `undefined` and THE APP HAD NEVER LOADED A SECOND PAGE of anything. Five
   * features of green tests, all stubbing the same wrong shape.
   *
   * So this journey asks for page two through the app's own data layer, which
   * is the only place that mismatch is observable.
   */
  it('J-46 paging never repeats a post within a session (FR-008)', async () => {
    const author = await actor('pagingauthor');
    const reader = await actor('pagingreader');
    const interest = (await reader.data.interests.listTop({ limit: 1 })).items[0]!;
    for (let i = 0; i < 8; i++) {
      await publishReadyImage(author, [interest.interestId], { caption: `paging ${i}` });
    }
    await reader.data.interests.follow(interest.interestId);

    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 4; page++) {
      const res = await reader.data.feed.home(cursor ? { limit: 3, cursor } : { limit: 3 });
      seen.push(...res.items.map((p) => p.postId));
      if (!res.page.nextCursor) break;
      cursor = res.page.nextCursor;
    }

    // The cursor carries what was SHOWN, so a post cannot come back. The old
    // timestamp cursor would have dropped candidates instead, which is the
    // opposite failure and equally invisible on page one.
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBeGreaterThan(3);
  });
});
