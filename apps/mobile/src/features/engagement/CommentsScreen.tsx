import type { Comment } from '@sih/shared';

export const MAX_COMMENT_LENGTH = 1000;

export function canSubmitComment(draft: string): boolean {
  const trimmed = draft.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_COMMENT_LENGTH;
}

/**
 * FR-040. A 403 here means the post itself is not readable, not that comments
 * are closed - the screen should send the person back rather than showing an
 * empty thread, which would imply the post exists and has nothing on it.
 */
export function messageForStatus(status: number): string | null {
  if (status === 403) return 'This post is not available to you.';
  if (status === 404) return 'This post is no longer available.';
  return null;
}

export function CommentsScreen(_props: { comments: Comment[] }) {
  return null;
}
