import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

describe('core journeys - feed', () => {
  /**
   * J-06, REWRITTEN FOR THE RANKED FEED (007/RS-003).
   *
   * It used to assert the negative case of 001/FR-033: a post in an unfollowed
   * interest must be ABSENT. That requirement is withdrawn, and the replacement
   * is not a softer version of it — under 007 the feed is drawn across the
   * catalogue, so an undeclared interest's post being reachable is the design.
   *
   * What SC-005 asks instead is the guarantee that actually protects a person:
   * a post made private is gone from the ranked feed on the FIRST request after
   * the change. Not eventually, not after a cache expires. That is the property
   * a ranked feed is most likely to lose, because caching a ranked page is so
   * obviously attractive.
   */
  it('J-06 a post flipped to private leaves the ranked feed on the NEXT request (SC-005)', async () => {
    const author = await actor('feedauthor');
    const reader = await actor('feedreader');
    const tops = await author.data.interests.listTop({ limit: 2 });
    const declared = tops.items[0]!;

    const postId = await publishReadyImage(author, [declared.interestId], { caption: 'about to vanish' });
    // Declared, so the post is in the candidate set for a reason rather than by
    // the luck of an exploration draw.
    await reader.data.interests.follow(declared.interestId);

    const before = await reader.data.feed.home({ limit: 50 });
    expect(before.items.map((p) => p.postId)).toContain(postId);

    await author.data.posts.update(postId, { visibility: 'private' });

    const after = await reader.data.feed.home({ limit: 50 });
    // ZERO stale appearances, on the very next request.
    expect(after.items.map((p) => p.postId)).not.toContain(postId);

    // And the author still has it, so the disappearance is visibility rather
    // than deletion - a test that only checked the reader would pass if the
    // flip had destroyed the post.
    const mine = await author.data.posts.byHandle(author.handle, {});
    expect(mine.items.map((p) => p.postId)).toContain(postId);
  });

  /**
   * The other half of the same withdrawal: a feed that never showed anything
   * outside what you declared could not broaden, and FR-007 makes broadening a
   * requirement rather than a nicety. Stated across several requests, because
   * exploration re-samples and one response is a draw from a random process.
   */
  it('J-06b the ranked feed reaches beyond what the reader has declared (FR-007)', async () => {
    const author = await actor('exploreauthor');
    const reader = await actor('explorereader');
    const tops = await author.data.interests.listTop({ limit: 2 });
    const declared = tops.items[0]!;
    const undeclared = tops.items[1]!;

    await publishReadyImage(author, [declared.interestId], { caption: 'declared' });
    const outside = await publishReadyImage(author, [undeclared.interestId], { caption: 'undeclared' });
    await reader.data.interests.follow(declared.interestId);

    let reached = false;
    for (let i = 0; i < 10 && !reached; i++) {
      const page = await reader.data.feed.home({ limit: 50 });
      reached = page.items.some((p) => p.postId === outside);
    }
    expect(reached).toBe(true);
  });

  it('J-07 interest space returns that interest posts', async () => {
    const author = await actor('spaceauthor');
    const reader = await actor('spacereader');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;

    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'in the space' });

    const space = await reader.data.interests.posts(interest.interestId, { limit: 50 });
    expect(space.items.map((p) => p.postId)).toContain(postId);
  });

  it('J-07 a private post is absent from the interest space for everyone else', async () => {
    const author = await actor('privauthor');
    const reader = await actor('privreader');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;

    const postId = await publishReadyImage(author, [interest.interestId], { visibility: 'private' });

    const mine = await author.data.interests.posts(interest.interestId, { limit: 50 });
    expect(mine.items.map((p) => p.postId)).toContain(postId);

    const theirs = await reader.data.interests.posts(interest.interestId, { limit: 50 });
    expect(theirs.items.map((p) => p.postId)).not.toContain(postId);
  });
  /**
   * 003/T053, REWRITTEN FOR FR-029.
   *
   * There was no coverage of following a person anywhere, at any level, because
   * the app had no way to do it: `apps/mobile/src/data` exposed no person-follow
   * method, so a journey driving the app's data layer could not have called one.
   * That half is unchanged and still the point — the follow is performed the way
   * a person performs it.
   *
   * What changed is the claim afterwards. It used to be FR-033's negative case:
   * a person-follow must not widen the feed past your followed interests. There
   * is no such boundary now (RS-001). FR-029 carries the intent across in the
   * only form a ranked feed can honour it: a follow REORDERS, and never admits
   * a post the ranking would not otherwise have considered.
   */
  it('follows a person through the app, and the follow reorders rather than admits (FR-029)', async () => {
    const author = await actor('t053author');
    const stranger = await actor('t053stranger');
    const reader = await actor('t053reader');
    const interest = (await reader.data.interests.listTop({ limit: 1 })).items[0]!;

    // The STRANGER publishes second, so recency alone puts them first and the
    // follow has something to overturn.
    const followedPost = await publishReadyImage(author, [interest.interestId], { caption: 't053 followed' });
    const strangerPost = await publishReadyImage(stranger, [interest.interestId], { caption: 't053 stranger' });
    await reader.data.interests.follow(interest.interestId);

    // Before, this line could not be written.
    await reader.data.people.follow(author.handle);

    // The server's own answer, read back through the app: a control that showed
    // "Following" from local state alone would pass an appearance check and be
    // wrong for anyone who followed from another device.
    const profile = await reader.data.people.get(author.handle);
    expect(profile.viewerIsFollowing).toBe(true);
    expect(profile.handle).toBe(author.handle);

    const ids = (await reader.data.feed.home({ limit: 50 })).items.map((p) => p.postId);
    // BOTH present. A follow that filtered would pass a "mine is here" check
    // while having become the subscription feed again.
    expect(ids).toContain(followedPost);
    expect(ids).toContain(strangerPost);
    expect(ids.indexOf(followedPost)).toBeLessThan(ids.indexOf(strangerPost));

    await reader.data.people.unfollow(author.handle);
    expect((await reader.data.people.get(author.handle)).viewerIsFollowing).toBe(false);
  });
  /**
   * A person's own posts must come back as POSTS, not as visibility candidates.
   *
   * `listByAuthor` ran its rows through VisibilityFilter and returned the
   * FILTER'S OUTPUT - postId, visibility, processingState, timestamps - so
   * `GET /people/{handle}/posts` answered 200 with `caption: null`, no media,
   * no counts and no author, for a post published with all of them. A person's
   * own profile listed rows containing nothing.
   *
   * Fifth instance of this defect in this codebase: the feed, post detail, both
   * comment paths and notifications each returned persistence or index rows as
   * responses before it. The filter decides WHAT is visible; it was never the
   * shape of what to send. Asserting on the caption is asserting the difference.
   */
  it("returns a person's own posts hydrated, not as visibility rows", async () => {
    const author = await actor('ownposts');
    const tops = await author.data.interests.listTop({ limit: 1 });
    const interestId = tops.items[0]!.interestId;
    await publishReadyImage(author, [interestId], { caption: 'on my own profile' });

    const page = await author.data.posts.byHandle(author.handle, {});
    expect(page.items.length).toBeGreaterThan(0);

    const mine = page.items.find((p) => p.caption === 'on my own profile');
    expect(mine).toBeDefined();
    // The fields a candidate row does not carry.
    expect(mine!.author.handle).toBe(author.handle);
    expect(mine!.interests.map((i) => i.interestId)).toContain(interestId);
    expect(mine!.media?.length ?? 0).toBeGreaterThan(0);
  });
});
