import { actor } from '../support/client';
import { publishReadyImage } from '../support/publish';
import type { Post } from '@sih/shared';

/**
 * 004/US5. A save is a bookmark, not a copy.
 *
 * SC-013 is the case that matters: a post whose visibility later excludes the
 * saver must be ABSENT, not stale. The tempting shortcut - "they saved it, so
 * they could see it" - is wrong at exactly the moment it matters.
 */
describe('004/US5 - saving a post', () => {
  it('FR-037 save, list, unsave', async () => {
    const author = await actor('saveAuthor');
    const saver = await actor('saver');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'worth keeping' });

    await saver.data.saved.save(postId);
    const listed = await saver.data.saved.list({ limit: 20 });
    expect(listed.items.map((p: Post) => p.postId)).toContain(postId);
    // A full post, not a candidate row - the seventh place this could go wrong.
    expect(listed.items.find((p: Post) => p.postId === postId)!.caption).toBe('worth keeping');

    await saver.data.saved.unsave(postId);
    expect((await saver.data.saved.list({ limit: 20 })).items.map((p: Post) => p.postId)).not.toContain(
      postId,
    );
  }, 120_000);

  it('FR-037 saving twice is idempotent, not a duplicate row', async () => {
    const author = await actor('idemAuthor');
    const saver = await actor('idemSaver');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId]);

    await saver.data.saved.save(postId);
    await saver.data.saved.save(postId);
    const listed = await saver.data.saved.list({ limit: 20 });
    expect(listed.items.filter((p: Post) => p.postId === postId)).toHaveLength(1);
  }, 120_000);

  it('FR-038 a saved list is private: it is only ever reachable as "mine"', async () => {
    const author = await actor('privAuthor');
    const saver = await actor('privSaver');
    const nosy = await actor('privNosy');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId]);
    await saver.data.saved.save(postId);

    // The other person's list is their own, and empty. There is no endpoint
    // that takes a handle, so this is the only shape the question can take.
    expect((await nosy.data.saved.list({ limit: 20 })).items).toHaveLength(0);
  }, 120_000);

  it('FR-037 saving a post you cannot see is refused', async () => {
    const author = await actor('secretAuthor');
    const stranger = await actor('secretStranger');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { visibility: 'private' });

    // Refused, so a save can never be a way to acquire access.
    await expect(stranger.data.saved.save(postId)).rejects.toMatchObject({ status: 404 });
  }, 120_000);

  /**
   * SC-013. THE ASSERTION THIS STORY EXISTS FOR.
   *
   * The saved ROW still says `public` - nothing updates it when the post
   * changes - so a list that trusted its own denormalised copy would show
   * exactly this post. It is filtered against the post's CURRENT state instead.
   */
  it('SC-013 a post the saver may no longer see is absent from their saved list', async () => {
    const author = await actor('flipAuthor');
    const saver = await actor('flipSaver');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId], { caption: 'about to vanish' });

    await saver.data.saved.save(postId);
    expect((await saver.data.saved.list({ limit: 20 })).items.map((p: Post) => p.postId)).toContain(postId);

    await author.data.posts.update(postId, { visibility: 'private' });

    const after = await saver.data.saved.list({ limit: 20 });
    expect(after.items.map((p: Post) => p.postId)).not.toContain(postId);
  }, 120_000);

  it('SC-013 and a deleted post leaves no trace in a saved list', async () => {
    const author = await actor('delAuthor');
    const saver = await actor('delSaver');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId]);
    await saver.data.saved.save(postId);

    await author.data.posts.remove(postId);
    expect((await saver.data.saved.list({ limit: 20 })).items.map((p: Post) => p.postId)).not.toContain(
      postId,
    );
  }, 120_000);

  it('FR-037 a post reports whether the viewer has saved it', async () => {
    const author = await actor('flagAuthor');
    const saver = await actor('flagSaver');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;
    const postId = await publishReadyImage(author, [interest.interestId]);

    expect((await saver.data.posts.get(postId)).viewerHasSaved).toBe(false);
    await saver.data.saved.save(postId);
    // Read back from the server, so the control reflects an answer rather than
    // a local flag - the defect that made every reaction button render unreacted.
    expect((await saver.data.posts.get(postId)).viewerHasSaved).toBe(true);
  }, 120_000);
});
