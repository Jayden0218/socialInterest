import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';

describe('core journeys - engagement', () => {
  it('J-08 comments on a post and a permitted viewer reads it', async () => {
    const author = await actor('commentauthor');
    const reader = await actor('commentreader');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId]);

    const comment = await reader.data.engagement.comment(postId, 'a real comment over HTTP');
    expect(comment.commentId).toBeTruthy();

    const page = await author.data.engagement.comments(postId, { limit: 20 });
    expect(page.items.map((c) => c.body)).toContain('a real comment over HTTP');
  });

  it('J-08 a reaction is recorded once per person (FR-039)', async () => {
    const author = await actor('reactauthor');
    const fan = await actor('reactfan');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId]);

    await fan.data.engagement.react(postId);
    await fan.data.engagement.react(postId);

    const post = await fan.data.posts.get(postId);
    expect(post.reactionCount).toBe(1);
    expect(post.viewerHasReacted).toBe(true);

    await fan.data.engagement.unreact(postId);
    expect((await fan.data.posts.get(postId)).reactionCount).toBe(0);
  });
});
