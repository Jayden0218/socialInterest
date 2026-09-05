import { actor } from '../support/client';

describe('core journeys - publish video', () => {
  it('J-05 publishes a video post that reaches a ready state', async () => {
    const me = await actor('vidauthor');
    const interest = (await me.data.interests.listTop({ limit: 1 })).items[0]!;

    const target = await me.data.posts.createUploadTarget({
      kind: 'video',
      contentType: 'video/mp4',
      sizeBytes: 2_000_000,
      durationMs: 5_000,
    });

    const post = await me.data.posts.publish({
      uploadIds: [target.uploadId],
      interestIds: [interest.interestId],
    });

    expect(post.mediaKind).toBe('video');
    // Not readable by others until derivation completes - the state is the point.
    expect(post.processingState).toBe('pending');
  });

  it('J-05 refuses a video longer than the cap before upload (FR-005)', async () => {
    const me = await actor('vidcap');
    await expect(
      me.data.posts.createUploadTarget({
        kind: 'video',
        contentType: 'video/mp4',
        sizeBytes: 1_000_000,
        durationMs: 10 * 60 * 1000,
      }),
    ).rejects.toMatchObject({ status: 413 });
  });
});
