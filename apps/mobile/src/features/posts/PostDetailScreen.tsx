import type { MediaItem, Post } from '@sih/shared';

/**
 * FR-009: a poster frame is shown before playback begins, so a video never
 * renders as a blank rectangle while it buffers. A post still processing shows
 * its processing state instead - only the author can see it at all.
 */
export function posterFor(media: MediaItem): string | null {
  return media.posterUrl ?? null;
}

export function isPlayable(post: Post): boolean {
  return post.processingState === 'ready' && post.mediaKind === 'video';
}

export function PostDetailScreen() {
  return null;
}
