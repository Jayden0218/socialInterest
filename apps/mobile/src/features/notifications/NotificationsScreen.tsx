import type { Notification } from '@sih/shared';

export interface NotificationPrefs {
  reaction: boolean;
  comment: boolean;
  follow: boolean;
}

/**
 * FR-048, FR-049.
 *
 * The list can legitimately be shorter than what the server stored: a
 * notification generated when a post was visible is filtered out once the post
 * is deleted or restricted. So an empty list is a normal state, not an error,
 * and the screen must not imply something failed.
 */
export const NOTIFICATION_CATEGORIES: { key: keyof NotificationPrefs; label: string }[] = [
  { key: 'reaction', label: 'Reactions to your posts' },
  { key: 'comment', label: 'Comments on your posts' },
  { key: 'follow', label: 'New followers' },
];

export function describe_(n: Notification): string {
  switch (n.kind) {
    case 'reaction':
      return `${n.actor.displayName} reacted to your post`;
    case 'comment':
      return `${n.actor.displayName} commented on your post`;
    case 'follow':
      return `${n.actor.displayName} followed you`;
  }
}

export function allDisabled(prefs: NotificationPrefs): boolean {
  return !prefs.reaction && !prefs.comment && !prefs.follow;
}

export function NotificationsScreen() {
  return null;
}
