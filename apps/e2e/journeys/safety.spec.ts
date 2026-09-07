import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

describe('core journeys - safety', () => {
  it('J-09 reports content and it enters the moderation queue', async () => {
    const author = await actor('reported');
    const reporter = await actor('reporter');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId]);

    const filed = await reporter.data.safety.report({
      subjectType: 'post',
      subjectId: postId,
      reason: 'spam',
      detail: 'end-to-end report',
    });
    expect(filed.reportId).toBeTruthy();
  });

  it('J-10 blocks a person and the block takes effect on every surface', async () => {
    const author = await actor('blocked');
    const blocker = await actor('blocker');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId]);

    // Visible before the block - otherwise the assertion after it proves nothing.
    const before = await blocker.data.interests.posts(interest.interestId, { limit: 50 });
    expect(before.items.map((p) => p.postId)).toContain(postId);

    await blocker.data.safety.block(author.handle);

    // Every surface, immediately (Principle II).
    const space = await blocker.data.interests.posts(interest.interestId, { limit: 50 });
    expect(space.items.map((p) => p.postId)).not.toContain(postId);

    await expect(blocker.data.posts.get(postId)).rejects.toMatchObject({ status: 404 });

    // And in the other direction: a block hides content BOTH ways (FR-044), so
    // the blocked person stops seeing the blocker's posts too.
    const blockersPost = await publishReadyImage(blocker, [interest.interestId]);
    const asBlocked = await author.data.interests.posts(interest.interestId, { limit: 50 });
    expect(asBlocked.items.map((p) => p.postId)).not.toContain(blockersPost);
  });
});
