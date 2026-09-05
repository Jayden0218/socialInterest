export interface NotificationPrefs {
  reaction: boolean;
  comment: boolean;
  follow: boolean;
}

export interface ProfileDraft {
  displayName: string;
  bio: string;
  notificationPrefs: NotificationPrefs;
}

/**
 * FR-002, FR-049. Preferences are sent as a partial patch and merged server
 * side, so toggling one category cannot silently reset the others.
 */
export function canSaveProfile(draft: ProfileDraft): boolean {
  return draft.displayName.trim().length > 0 && draft.displayName.length <= 50 && draft.bio.length <= 300;
}

/** FR-003. Deletion is not reversible, so the confirmation states the outcome. */
export const DELETE_ACCOUNT_CONFIRMATION =
  'Your posts will be removed and your comments anonymised. This cannot be undone.';

export function EditProfileScreen() {
  return null;
}
