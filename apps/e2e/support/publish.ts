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
