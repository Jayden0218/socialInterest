export type ReportSubject = 'post' | 'comment' | 'interest';

export const REPORT_REASONS = [
  { value: 'spam', label: 'Spam' },
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'explicit', label: 'Explicit content' },
  { value: 'violence', label: 'Violence' },
  { value: 'misinformation', label: 'Misinformation' },
  { value: 'other', label: 'Something else' },
] as const;

/**
 * FR-043. Interest NAMES are reportable, not only posts and comments - an
 * interest name is content every visitor to that space sees. The action must be
 * reachable from the interest header, or the route to a human does not exist in
 * practice however well it works in the API.
 */
export function reportActionLabel(subject: ReportSubject): string {
  switch (subject) {
    case 'post':
      return 'Report this post';
    case 'comment':
      return 'Report this comment';
    case 'interest':
      return 'Report this interest name';
  }
}

/**
 * FR-044. Blocking is described accurately: it is mutual and it severs the
 * follow, which surprises people who expect it to be one-way and reversible.
 */
export const BLOCK_CONFIRMATION =
  'You will not see each other’s posts, and any follow between you will be removed. ' +
  'Unblocking later does not restore the follow.';

export function SafetyActions() {
  return null;
}
