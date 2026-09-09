import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

/**
 * 008/T041, US3 — THE FOLLOWING FEED, OVER REAL HTTP, THROUGH THE APP'S OWN
 * DATA LAYER.
 *
 * The integration suite covers the same rules against the service. This exists
 * for the one thing that suite cannot claim: that the APP can read it.
 *
 * 007 found five features' worth of lists — feed, interest spaces, profiles,
 * comments, notifications — that had NEVER loaded a second page, because
 * `ApiPage<T>` declared `nextCursor` at the top level while every endpoint
 * nested it under `page`. Every mobile test stubbed the data layer and the stubs
 * were wrong in exactly the way the type was, so they agreed with each other and
 * neither agreed with the server. Only a request found it.
 *
 * So the load-bearing assertion below is "page two actually arrives".
 */
describe('008/SC-004 the Following feed', () => {
  it('returns only followed authors, and its SECOND page loads', async () => {
    const viewer = await actor('followViewer');
    const friend = await actor('followFriend');
    const stranger = await actor('followStranger');
    const interest = (await viewer.data.interests.listTop({ limit: 1 })).items[0]!;

    const mine: string[] = [];
    for (let i = 0; i < 4; i++) {
      mine.push(await publishReadyImage(friend, [interest.interestId], { caption: `friend ${i}` }));
    }
    const theirs = await publishReadyImage(stranger, [interest.interestId], { caption: 'a stranger' });

    await viewer.data.people.follow(friend.handle);

    const first = await viewer.data.feed.following({ limit: 2 });
    expect(first.items).toHaveLength(2);

    /**
     * THE ASSERTION 007's DEFECT WOULD HAVE FAILED. `nextCursor` is nested under
     * `page`; a client reading it from the top level gets `undefined`, decides
     * the list is exhausted, and every screen looks correct because the FIRST
     * page always arrives.
     */
    expect(typeof first.page.nextCursor).toBe('string');

    const second = await viewer.data.feed.following({ limit: 2, cursor: first.page.nextCursor! });
    expect(second.items.length).toBeGreaterThan(0);

    const ids = [...first.items, ...second.items].map((p) => p.postId);
    expect({
      noStranger: !ids.includes(theirs),
      allMine: ids.every((id) => mine.includes(id)),
      noDuplicates: new Set(ids).size === ids.length,
    }).toEqual({ noStranger: true, allMine: true, noDuplicates: true });
  }, 180_000);

  it('FR-010 tells a viewer who follows nobody what the surface is for', async () => {
    const lonely = await actor('followLonely');
    const page = await lonely.data.feed.following({ limit: 10 });
    // From a REAL response. 006 recorded a test that invented its own hint
    // values (`'no-follows'`, `null`) where the product says something else, and
    // failed for its own reason rather than the product's.
    expect({ items: page.items.length, hint: page.page.emptyStateHint })
      .toEqual({ items: 0, hint: 'no_follows' });
  }, 120_000);

  it('SC-005 reading it moves no ranking weight', async () => {
    const viewer = await actor('followSignalViewer');
    const friend = await actor('followSignalFriend');
    const interest = (await viewer.data.interests.listTop({ limit: 1 })).items[0]!;
    await publishReadyImage(friend, [interest.interestId], { caption: 'should not train' });
    await viewer.data.people.follow(friend.handle);

    const before = JSON.stringify(await viewer.data.signals.disclosure());
    await viewer.data.feed.following({ limit: 10 });
    await viewer.data.feed.following({ limit: 1 });
    const after = JSON.stringify(await viewer.data.signals.disclosure());

    expect({ before, after }).toEqual({ before, after: before });
  }, 120_000);
});
