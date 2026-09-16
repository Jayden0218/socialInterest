import { randomUUID } from 'node:crypto';
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

/**
 * 013/FR-004. Publishes a post that NAMES its interest, creating it.
 *
 * There is no `interests.create` any more: an interest with no posts is
 * unrepresentable, so the only gesture that brings one into existence is
 * publishing into it. A journey that needs an interest of its own therefore
 * starts by publishing into it, and gets both ids back — the post's, because
 * the caller usually asserts on it, and the interest's, because every later
 * publish in the same journey should reference the id rather than re-send the
 * name and depend on the resolve step agreeing with itself.
 *
 * The name must be HIGH-ENTROPY, not merely unique: FR-008 compares a proposed
 * name against EVERY interest, and two names differing by one character score
 * over the blocking threshold — which is why the suffix here is random rather
 * than a timestamp. `interest-merge.spec.ts` records the same trap.
 */
export async function publishReadyNamingInterest(
  who: Actor,
  interestName: string,
  opts: {
    caption?: string;
    visibility?: 'public' | 'followers' | 'private';
    bytes?: Buffer;
  } = {},
): Promise<{ postId: string; interestId: string }> {
  const bytes = opts.bytes ?? jpegPlain();
  const target = await who.data.posts.createUploadTarget({
    kind: 'image',
    contentType: 'image/jpeg',
    sizeBytes: bytes.byteLength,
  });
  await who.data.posts.uploadBytes(target, bytes, 'image/jpeg');
  const post = await who.data.posts.publish({
    uploadIds: [target.uploadId],
    interestIds: [],
    interestNames: [interestName],
    ...(opts.caption ? { caption: opts.caption } : {}),
    ...(opts.visibility ? { visibility: opts.visibility } : {}),
  });
  const interestId = post.interests[0]?.interestId;
  if (!interestId) throw new Error(`publish named "${interestName}" and came back with no interest`);

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const current = await who.data.posts.get(post.postId);
    if (current.processingState === 'ready') return { postId: post.postId, interestId };
    if (current.processingState === 'failed') {
      throw new Error(`media processing failed for ${post.postId}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`post ${post.postId} never became ready`);
}

/** A name no other run can collide with, and far enough from every other name
 * that FR-008's near-duplicate gate cannot refuse it. */
export function freshInterestName(stem: string): string {
  return `${stem} ${randomUUID().slice(0, 8)}`;
}
