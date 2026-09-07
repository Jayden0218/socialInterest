import type { MediaProcessor, ObjectStore } from './ports';

export interface ImageJobInput {
  postId: string;
  ordinal: number;
  originalKey: string;
  contentType: string;
  /** FR-010: the author's explicit opt-in. Absent or false means strip. */
  keepLocationMetadata: boolean;
}

export interface MediaItemPatch {
  renditions: Record<string, string>;
  width: number;
  height: number;
  exifStripped: boolean;
  processingState: 'ready' | 'failed';
  originalKey?: string | null;
}

export interface ImageJobDeps {
  store: ObjectStore;
  processor: MediaProcessor;
  updateMediaItem(postId: string, ordinal: number, patch: MediaItemPatch): Promise<void>;
  reconcilePost(postId: string): Promise<void>;
}

/**
 * FR-010 IS ENFORCED HERE, AND ONLY HERE.
 *
 * The strip is server-side because it is a guarantee, not a courtesy: a
 * client-side strip is unverifiable and trivially bypassed by a modified client.
 * Constitution principle III.
 *
 * `exifStripped` gates the media item reaching `ready`, and a post only becomes
 * `ready` when every item is - so an unprocessed original can never reach a
 * reader even if this handler fails.
 *
 * The original is deleted once the derivative is stored, so the un-stripped
 * bytes do not linger in the bucket.
 */
export async function handleImageJob(input: ImageJobInput, deps: ImageJobDeps): Promise<void> {
  try {
    const source = await deps.store.getObject(input.originalKey);

    const processed = await deps.processor.processImage({
      source,
      contentType: input.contentType,
      keepLocationMetadata: input.keepLocationMetadata,
    });

    const derivedKey = `posts/${input.postId}/${String(input.ordinal).padStart(3, '0')}.jpg`;
    await deps.store.putObject(derivedKey, processed.body, 'image/jpeg');

    await deps.updateMediaItem(input.postId, input.ordinal, {
      renditions: { original: derivedKey },
      width: processed.width,
      height: processed.height,
      // Never hard-coded true: it reflects what the processor actually did.
      exifStripped: processed.exifStripped,
      processingState: 'ready',
      originalKey: null,
    });

    if (!input.keepLocationMetadata) {
      // Only now is it safe: the stripped derivative is durable.
      await deps.store.deleteObject(input.originalKey);
    }
  } catch (error) {
    await deps.updateMediaItem(input.postId, input.ordinal, {
      renditions: {},
      width: 0,
      height: 0,
      exifStripped: false,
      processingState: 'failed',
    });
    throw error;
  } finally {
    await deps.reconcilePost(input.postId);
  }
}
