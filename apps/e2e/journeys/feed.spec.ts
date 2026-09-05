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
});
