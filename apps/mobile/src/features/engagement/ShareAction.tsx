import type { Visibility } from '@sih/shared';

/**
 * FR-041, FR-042. A share link grants nothing - it resolves against the post's
 * visibility every time. So the sheet warns BEFORE the person sends it, rather
 * than letting them discover from a confused recipient that the link did not
 * open.
 */
export function shareWarning(visibility: Visibility): string | null {
  switch (visibility) {
    case 'public':
      return null;
    case 'followers':
      return 'Only your followers can open this link.';
    case 'private':
      return 'This post is private. Nobody else can open this link.';
  }
}

export function isShareable(visibility: Visibility): boolean {
  // Private posts can still be linked for the author's own reference, but the
  // warning above makes clear that sending it achieves nothing.
  return visibility !== 'private';
}

export function ShareAction() {
  return null;
}
