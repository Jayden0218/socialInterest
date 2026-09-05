/**
 * Media caps. FR-005 requires size and duration limits to be checked BEFORE a
 * presigned upload target is issued, so the caller learns of a limit up front
 * rather than after a long upload. That means these numbers must exist before
 * the upload path is built - they were moved here from Phase 10 for that reason.
 *
 * VIDEO_MAX_DURATION_MS = 180_000 (3 minutes)
 *   spec.md Assumptions calls for "short-form: a duration cap in the range of a
 *   few minutes". 3 was chosen over 5 because of SC-003: video must be playable
 *   within 60s of upload finishing for 95% of uploads. A 5-minute source needs
 *   sustained faster-than-5x transcode to hit that; 3 minutes leaves headroom.
 *   Raising this without re-running the transcode benchmark puts SC-003 at risk.
 */
export const MEDIA_LIMITS = {
  video: {
    maxDurationMs: 180_000,
    maxBytes: 500 * 1024 * 1024,
    contentTypes: ['video/mp4', 'video/quicktime'] as const,
  },
  image: {
    maxBytes: 25 * 1024 * 1024,
    maxPerPost: 10,
    contentTypes: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'] as const,
  },
  avatar: {
    maxBytes: 5 * 1024 * 1024,
    contentTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
  },
} as const;

export type MediaKind = keyof typeof MEDIA_LIMITS;

export function isSupportedContentType(kind: MediaKind, contentType: string): boolean {
  return (MEDIA_LIMITS[kind].contentTypes as readonly string[]).includes(contentType);
}
