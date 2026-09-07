import { actor } from '../support/client';
import { mp4Short } from '../support/media';
import { eventually } from '../support/eventually';
import type { Post } from '@sih/shared';

/**
 * 001/FR-005 and 001/FR-009, EXERCISED FOR THE FIRST TIME.
 *
 * These requirements have been reported complete twice. Until now this file
 * created an upload target and asserted a state string - it never uploaded a
 * byte, so nothing had ever run ffmpeg on a real file, produced a poster frame,
 * or checked that a video reaches `ready`.
 *
 * `mp4Short()` has existed in apps/e2e/support/media.ts the whole time, produces
 * a real H.264 clip through the ffmpeg container, and was called by NOTHING.
 * A working fixture sat unused while the requirements it serves were reported
 * unverified. That is the more useful half of this finding.
 *
 * What this still does NOT prove: that a video PLAYS on a device. That is
 * SC-011 and it needs an emulator run.
 */
describe('core journeys - publish video (001/FR-005, FR-009)', () => {
  it('J-05 a real video is uploaded, transcoded, and reaches ready with a poster frame', async () => {
    const me = await actor('vidreal');
    const interest = (await me.data.interests.listTop({ limit: 1 })).items[0]!;

    const bytes = mp4Short(1);
    // A real file, not a declared size. The server derives kind and duration
    // from its own upload record, so a fabricated size would be checked against
    // nothing.
    expect(bytes.byteLength).toBeGreaterThan(1000);

    const target = await me.data.posts.createUploadTarget({
      kind: 'video',
      contentType: 'video/mp4',
      sizeBytes: bytes.byteLength,
      durationMs: 1_000,
    });
    await me.data.posts.uploadBytes(target, bytes, 'video/mp4');

    const post = await me.data.posts.publish({
      uploadIds: [target.uploadId],
      interestIds: [interest.interestId],
      caption: 'a real video',
    });
    expect(post.mediaKind).toBe('video');

    /**
     * FR-009. Transcoding runs out of band, so this waits for the OUTCOME.
     * `ready` is what makes the post visible to anyone but its author, and the
     * poster frame is what stops a video rendering as a blank rectangle while
     * it buffers.
     */
    const ready: Post = await eventually(
      () => me.data.posts.get(post.postId),
      (p) => p.processingState === 'ready' || p.processingState === 'failed',
      { timeoutMs: 120_000, intervalMs: 500, describe: 'the video finishing transcode' },
    );
    expect(ready.processingState).toBe('ready');

    const media = ready.media ?? [];
    expect(media.length).toBeGreaterThan(0);
    const first = media[0]!;
    // The poster frame, and playable renditions. Asserting only `ready` would
    // pass against a processor that marked it done and produced nothing.
    expect(first.posterUrl ?? null).not.toBeNull();
    expect(Object.keys(first.renditions ?? {}).length).toBeGreaterThan(0);
  }, 180_000);

  it('J-05 a permitted viewer can see the video once it is ready', async () => {
    const author = await actor('vidauthor2');
    const viewer = await actor('vidviewer');
    const interest = (await author.data.interests.listTop({ limit: 1 })).items[0]!;

    const bytes = mp4Short(1);
    const target = await author.data.posts.createUploadTarget({
      kind: 'video',
      contentType: 'video/mp4',
      sizeBytes: bytes.byteLength,
      durationMs: 1_000,
    });
    await author.data.posts.uploadBytes(target, bytes, 'video/mp4');
    const post = await author.data.posts.publish({
      uploadIds: [target.uploadId],
      interestIds: [interest.interestId],
    });

    await eventually(
      () => author.data.posts.get(post.postId),
      (p) => p.processingState === 'ready',
      { timeoutMs: 120_000, intervalMs: 500, describe: 'the video finishing transcode' },
    );

    // Before `ready` a post is visible ONLY to its author - which is the state
    // 002 found the whole product stuck in. Reaching it here is the assertion.
    const asViewer = await viewer.data.posts.get(post.postId);
    expect(asViewer.postId).toBe(post.postId);
    expect(asViewer.mediaKind).toBe('video');
  }, 180_000);

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
