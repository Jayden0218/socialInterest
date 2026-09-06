import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

describe('core journeys - feed', () => {
  it('J-06 home feed shows only posts from followed interests (Principle I)', async () => {
    const author = await actor('feedauthor');
    const reader = await actor('feedreader');
    const tops = await author.data.interests.listTop({ limit: 2 });
    const followed = tops.items[0]!;
    const notFollowed = tops.items[1]!;

    const wanted = await publishReadyImage(author, [followed.interestId], { caption: 'in a followed interest' });
    const unwanted = await publishReadyImage(author, [notFollowed.interestId], { caption: 'not followed' });

    await reader.data.interests.follow(followed.interestId);
    const feed = await reader.data.feed.home({ limit: 50 });
    const ids = feed.items.map((p) => p.postId);

    expect(ids).toContain(wanted);
    // The negative case is the requirement (FR-033). A feed that merely contains
    // the right post would also pass if it contained everything.
    expect(ids).not.toContain(unwanted);
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
   * 003/T053. Following a person, through the app's own data layer.
   *
   * There was no coverage of this anywhere, at any level, because the app had
   * no way to do it: `apps/mobile/src/data` exposed no person-follow method,
   * so a journey that drives the app's data layer - which is the whole point of
   * this suite - could not have called one. The API's own tests covered the
   * endpoint; nothing covered the app reaching it.
   *
   * The FR-033 assertion below is the one that matters and already existed.
   * What is new is that the follow which is supposed not to widen the feed is
   * now performed the way a person performs it.
   */
  it('follows a person through the app, and the follow does not widen the feed (FR-033)', async () => {
    const author = await actor('t053author');
    const reader = await actor('t053reader');
    const tops = await reader.data.interests.listTop({ limit: 2 });
    const followed = tops.items[0]!;
    const other = tops.items[1]!;

    await publishReadyImage(author, [followed.interestId], { caption: 't053 in a followed interest' });
    await publishReadyImage(author, [other.interestId], { caption: 't053 must not appear' });
    await reader.data.interests.follow(followed.interestId);

    // Before, this line could not be written.
    await reader.data.people.follow(author.handle);

    // The server's own answer, read back through the app: a control that showed
    // "Following" from local state alone would pass an appearance check and be
    // wrong for anyone who followed from another device.
    const profile = await reader.data.people.get(author.handle);
    expect(profile.viewerIsFollowing).toBe(true);
    expect(profile.handle).toBe(author.handle);

    const feed = await reader.data.feed.home({ limit: 50 });
    const captions = feed.items.map((p) => p.caption);
    expect(captions).toContain('t053 in a followed interest');
    // Principle I, non-negotiable. The person-follow must not have added the
    // other interest.
    expect(captions).not.toContain('t053 must not appear');

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
