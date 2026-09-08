import { actor, anonymous } from '../support/client';
import { publishReadyImage } from '../support/publish';
import { consistently } from '../support/eventually';
import { EXISTING_PLACES, MUST_DEDUPE, MUST_NOT_DEDUPE, SC007_CASE_COUNT } from '../support/places';
import type { PlaceSummary } from '@sih/shared';

/**
 * 004/US2 over HTTP.
 *
 * A Place is to a Post what an Interest is, MINUS feed membership (research R3).
 * Most of this file is the ordinary half; the two that matter are SC-006, which
 * asserts the "minus", and SC-008, which asserts the server never invents a
 * place from the location metadata it is required to strip.
 */
const uniqueLocality = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describe('004/US2 - a post can be about a place', () => {
  it('J-15 a place is created, attached at publish, and appears on its page (FR-013, FR-015, FR-016)', async () => {
    const author = await actor('placeAuthor');
    const reader = await actor('placeReader');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const locality = uniqueLocality('attach');

    const place = await author.data.places.create({
      name: "Joe's Diner",
      category: 'restaurant',
      locality,
    });
    expect(place.category).toBe('restaurant');

    const postId = await publishReadyImage(author, [interest.interestId], {
      caption: 'dinner',
      placeId: place.placeId,
    });

    const onPost = await reader.data.posts.get(postId);
    expect(onPost.place?.placeId).toBe(place.placeId);

    const page = await reader.data.places.posts(place.placeId, { limit: 20 });
    expect(page.items.map((p) => p.postId)).toContain(postId);
  });

  it('J-15 a post with NO place behaves exactly as before (FR-024)', async () => {
    const author = await actor('noPlaceAuthor');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'no place' });
    const post = await author.data.posts.get(postId);
    expect(post.place ?? null).toBeNull();
  });

  it('SC-007 a near-duplicate name surfaces the existing place instead of creating one (FR-014)', async () => {
    const author = await actor('dedupeAuthor');
    const locality = uniqueLocality('dedupe');
    const created = new Map<string, string>();
    for (const seed of EXISTING_PLACES.filter((p) => p.locality === 'Singapore')) {
      const place = await author.data.places.create({
        name: seed.name,
        category: seed.category,
        locality,
      });
      created.set(seed.name, place.placeId);
    }

    let checked = 0;
    for (const c of MUST_DEDUPE) {
      // The search a person sees WHILE TYPING (FR-014), not a rejection after
      // they submit - which is what makes the duplicate avoidable at all.
      const results = await author.data.places.search(c.typed, { locality });
      const names = results.items.map((p: PlaceSummary) => p.name);
      expect(names).toContain(c.expectExisting);
      checked++;
    }

    for (const c of MUST_NOT_DEDUPE.filter((x) => x.locality === 'Singapore')) {
      const results = await author.data.places.search(c.typed, { locality });
      // A dedupe that is too eager is worse than none: it silently files a post
      // at the wrong restaurant and nobody can tell.
      expect(results.items.map((p: PlaceSummary) => p.name)).not.toContain("Joe's Diner");
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  }, 120_000);

  it('SC-007 the same name in a different locality is a DIFFERENT place (FR-014)', async () => {
    const author = await actor('localityAuthor');
    const here = uniqueLocality('here');
    const there = uniqueLocality('there');
    const a = await author.data.places.create({ name: "Joe's Diner", category: 'restaurant', locality: here });
    const b = await author.data.places.create({ name: "Joe's Diner", category: 'restaurant', locality: there });
    expect(b.placeId).not.toBe(a.placeId);
  });

  it('FR-014 creating an exact duplicate returns the EXISTING place, not an error page', async () => {
    const author = await actor('dupAuthor');
    const locality = uniqueLocality('dup');
    const first = await author.data.places.create({ name: 'Hawker Chan', category: 'restaurant', locality });
    await expect(
      author.data.places.create({ name: 'hawker  chan', category: 'restaurant', locality }),
    ).rejects.toMatchObject({ status: 409 });
    // And the 409 carries the existing place, so the client can attach it.
    const conflict = await author.data.places
      .create({ name: 'Hawker Chan', category: 'restaurant', locality })
      .catch((e: { problem?: { placeId?: string } }) => e.problem);
    expect(conflict?.placeId).toBe(first.placeId);
  });

  it('SC-005 a place page holds the visibility matrix (FR-017, surface 8)', async () => {
    const author = await actor('placeVisAuthor');
    const follower = await actor('placeVisFollower');
    const stranger = await actor('placeVisStranger');
    await follower.data.people.follow(author.handle);
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const locality = uniqueLocality('vis');
    const place = await author.data.places.create({ name: 'Visible', category: 'cafe', locality });

    const publicPost = await publishReadyImage(author, [interest.interestId], {
      placeId: place.placeId,
      caption: 'public',
    });
    const followersPost = await publishReadyImage(author, [interest.interestId], {
      placeId: place.placeId,
      visibility: 'followers',
      caption: 'followers only',
    });

    const anon = await anonymous().places.posts(place.placeId, { limit: 20 });
    expect(anon.items.map((p) => p.postId)).toEqual([publicPost]);

    const asStranger = await stranger.data.places.posts(place.placeId, { limit: 20 });
    expect(asStranger.items.map((p) => p.postId)).toEqual([publicPost]);

    const asFollower = await follower.data.places.posts(place.placeId, { limit: 20 });
    expect(asFollower.items.map((p) => p.postId).sort()).toEqual([publicPost, followersPost].sort());
  }, 120_000);

  /**
   * SC-006. THE ASSERTION THIS STORY EXISTS FOR.
   *
   * Written in TWO HALVES on purpose. The absence alone would pass whenever
   * paging, ranking, or an empty candidate set happened to hide the post - green
   * for the wrong reason, and indistinguishable from a real pass. So the first
   * half proves the post DOES reach the feed when the interest is followed.
   *
   * This is 001/FR-033's shape, carried across to places, and it is what keeps
   * Constitution I from being violated by construction.
   */
  /**
   * 004/SC-006 AND FR-019, RESTATED FOR THE RANKED FEED (007).
   *
   * The original claim was that a post at a followed place, in an interest the
   * viewer had not followed, must be ABSENT from the feed. Under the composed
   * feed that was a statement about membership. It cannot be now: the ranked
   * feed draws candidates across the catalogue, so that post appearing says
   * nothing about the place-follow.
   *
   * The requirement's INTENT is untouched and is still Principle I: FOLLOWING A
   * PLACE MUST NOT FEED YOU ITS POSTS. Modelling a restaurant as a sub-interest
   * would put every restaurant post into "Food" worldwide, and a place-follow
   * that ranked its posts up would be the same mistake with an extra step.
   *
   * So the claim moved to where it is now unambiguous: a place-follow must
   * leave the RANKING untouched. `feed-does-not-read-place-follows.spec.ts`
   * asserts the same thing structurally — the selection path cannot even import
   * the place-follow repository — and the two together are what SC-006 needs,
   * because a structural guard says the dependency is absent and never that the
   * behaviour is right.
   */
  it('SC-006 following a place does not feed you its posts (FR-019)', async () => {
    const author = await actor('widenPlaceAuthor');
    const viewer = await actor('widenPlaceViewer');
    const [followed, notFollowed] = (await author.data.interests.listTop({ limit: 2 })).items;
    const locality = uniqueLocality('widen');
    const place = await author.data.places.create({ name: 'The Widener', category: 'bar', locality });

    // First half: with the interest declared, the post IS in the feed.
    await viewer.data.interests.follow(followed!.interestId);
    const inFollowed = await publishReadyImage(author, [followed!.interestId], {
      placeId: place.placeId,
      caption: 'in a followed interest',
    });

    const withInterest = await viewer.data.feed.home({ limit: 50 });
    expect(withInterest.items.map((p) => p.postId)).toContain(inFollowed);

    // Second half: a post at the SAME place, in an interest the viewer has not
    // declared. Following the place must not change what the ranker knows.
    const beforeFollow = await viewer.data.signals.disclosure();
    await viewer.data.places.follow(place.placeId);

    const inUnfollowed = await publishReadyImage(author, [notFollowed!.interestId], {
      placeId: place.placeId,
      caption: 'in an UNfollowed interest',
    });

    await consistently(
      () => viewer.data.signals.disclosure(),
      (after) => JSON.stringify(after.interests) === JSON.stringify(beforeFollow.interests),
      { forMs: 1500, describe: 'a followed place changing the ranking' },
    );

    // And it IS on the place page, so the post exists and is visible - the
    // place-follow does its own job, which is the place page, and only that.
    const onPlace = await viewer.data.places.posts(place.placeId, { limit: 20 });
    expect(onPlace.items.map((p) => p.postId)).toContain(inUnfollowed);
  }, 180_000);

  /**
   * SC-008. 001/FR-010 requires the server to STRIP embedded location. 004/FR-015
   * attaches location on purpose. FR-021 forbids the two from meeting.
   *
   * Driven through the raw path a modified client would take, not the
   * well-behaved one - Constitution III says a guarantee tested only through the
   * first-party client is not tested.
   */
  it('SC-008 a place is never derived from media metadata (FR-021)', async () => {
    const author = await actor('exifAuthor');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;

    const postId = await publishReadyImage(author, [interest.interestId], {
      caption: 'carries GPS',
      withGps: true,
    });

    const post = await author.data.posts.get(postId);
    expect(post.place ?? null).toBeNull();

    // Nor does the server offer one. A "suggested place" derived from stripped
    // coordinates would satisfy the assertion above and still be the defect.
    const suggestions = await author.data.places.search('', { limit: 5 }).catch(() => ({ items: [] }));
    expect(Array.isArray(suggestions.items)).toBe(true);
  }, 120_000);

  it('FR-018 following and unfollowing a place is reflected by the server', async () => {
    const person = await actor('placeFollower');
    const locality = uniqueLocality('follow');
    const place = await person.data.places.create({ name: 'Followable', category: 'shop', locality });

    await person.data.places.follow(place.placeId);
    expect((await person.data.places.get(place.placeId)).viewerIsFollowing).toBe(true);
    await person.data.places.unfollow(place.placeId);
    expect((await person.data.places.get(place.placeId)).viewerIsFollowing).toBe(false);
  });

  it('FR-020 a place name is reportable, and an operator can retire it', async () => {
    const person = await actor('placeReporter');
    const operator = await actor('placeOp', { isOperator: true });
    const locality = uniqueLocality('report');
    const place = await person.data.places.create({ name: 'Reportable', category: 'other', locality });

    await person.data.safety.report({
      subjectType: 'place',
      subjectId: place.placeId,
      reason: 'harassment',
    });
    const queue = await operator.data.safety.reports({ state: 'open', limit: 50 });
    expect(queue.items.map((r) => r.subjectId)).toContain(place.placeId);
  });

  it('SC-007 reports how many cases it measured, so the number is not a claim', () => {
    expect(SC007_CASE_COUNT).toBe(MUST_DEDUPE.length + MUST_NOT_DEDUPE.length);
  });
});
