import type { Actor } from './client';
import { jpegPlain, jpegWithGps } from './media';

/**
 * Publishes an image post and waits for it to become readable by other people.
 *
 * A post stays `pending` until the media pipeline finishes, and a pending post is
 * visible ONLY to its author. Journeys about what other people can see are
 * meaningless without this - they would pass for the wrong reason.
 */
export async function publishReadyImage(
  who: Actor,
  interestIds: string[],
  opts: {
    caption?: string;
    visibility?: 'public' | 'followers' | 'private';
    withGps?: boolean;
    /** 004/FR-015. Optional - a post with no place behaves exactly as before. */
    placeId?: string;
    /**
     * 006. Supply the image bytes.
     *
     * Defaults to the suite's 1x1 pixel, which is right for asserting that a
     * byte reached storage and useless for a screenshot anyone will look at.
     */
    bytes?: Buffer;
  } = {},
): Promise<string> {
  const bytes = opts.bytes ?? (opts.withGps ? jpegWithGps() : jpegPlain());
  const target = await who.data.posts.createUploadTarget({
    kind: 'image',
    contentType: 'image/jpeg',
    sizeBytes: bytes.byteLength,
  });
  await who.data.posts.uploadBytes(target, bytes, 'image/jpeg');
  const post = await who.data.posts.publish({
    uploadIds: [target.uploadId],
    interestIds,
    ...(opts.caption ? { caption: opts.caption } : {}),
    ...(opts.visibility ? { visibility: opts.visibility } : {}),
    ...(opts.placeId ? { placeId: opts.placeId } : {}),
  });

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const current = await who.data.posts.get(post.postId);
    if (current.processingState === 'ready') return post.postId;
    if (current.processingState === 'failed') {
      throw new Error(`media processing failed for ${post.postId}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`post ${post.postId} never became ready`);
}

/**
 * 008/US1. Publishes a post with SEVERAL images and waits for it to be readable.
 *
 * `publishReadyImage` above takes exactly one upload, which is not a limitation
 * of the product — `PostCreate` has always taken `uploadIds`, plural, and
 * `media.limits.ts` allows ten. It is a limitation of every fixture this suite
 * has ever had, and it is why nothing noticed that nine of ten photographs were
 * unreachable in the app.
 */
export async function publishReadyImages(
  who: Actor,
  interestIds: string[],
  count: number,
  opts: { caption?: string; visibility?: 'public' | 'followers' | 'private' } = {},
): Promise<string> {
  if (count < 1) throw new Error('publishReadyImages needs at least one image');
  const uploadIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = jpegPlain();
    const target = await who.data.posts.createUploadTarget({
      kind: 'image',
      contentType: 'image/jpeg',
      sizeBytes: bytes.byteLength,
    });
    await who.data.posts.uploadBytes(target, bytes, 'image/jpeg');
    uploadIds.push(target.uploadId);
  }
  const post = await who.data.posts.publish({
    uploadIds,
    interestIds,
    ...(opts.caption ? { caption: opts.caption } : {}),
    ...(opts.visibility ? { visibility: opts.visibility } : {}),
  });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const current = await who.data.posts.get(post.postId);
    if (current.processingState === 'ready') return post.postId;
    if (current.processingState === 'failed') {
      throw new Error(`media processing failed for ${post.postId}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`post ${post.postId} never became ready`);
}
