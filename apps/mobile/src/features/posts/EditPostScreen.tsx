import type { InterestRef, Visibility } from '@sih/shared';

export interface EditPostDraft {
  caption: string;
  interests: InterestRef[];
  visibility: Visibility;
}

/**
 * FR-011, FR-017. Narrowing visibility is the one edit with consequences the
 * person cannot undo by editing again: outstanding share links stop resolving
 * immediately (FR-042), and anyone who had the post open loses it. So the screen
 * says so before the change rather than after.
 */
export function narrowingWarning(from: Visibility, to: Visibility): string | null {
  const rank: Record<Visibility, number> = { public: 2, followers: 1, private: 0 };
  if (rank[to] >= rank[from]) return null;
  return to === 'private'
    ? 'Existing links to this post will stop working, and only you will see it.'
    : 'Existing links will only open for your followers.';
}

/** FR-006 holds for edits: a post cannot be left with no interest. */
export function canSave(draft: EditPostDraft): boolean {
  return draft.interests.length > 0 && draft.caption.length <= 2000;
}

export function EditPostScreen() {
  return null;
}
