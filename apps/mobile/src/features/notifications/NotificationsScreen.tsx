import { FlatList, Text, View } from 'react-native';
import type { Notification } from '@sih/shared';
import { theme } from '../../ui/theme';
import { EmptyState, Screen } from '../../ui/primitives';

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
 * is deleted or restricted. So an empty list is a NORMAL state, not an error,
 * and the screen must not imply something failed.
 */
export const NOTIFICATION_CATEGORIES: { key: keyof NotificationPrefs; label: string }[] = [
  { key: 'reaction', label: 'Reactions to your posts' },
  { key: 'comment', label: 'Comments on your posts' },
  { key: 'follow', label: 'New followers' },
];

export function describeNotification(n: Notification): string {
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

export function NotificationsScreen({
  notifications,
  prefs,
  onOpen,
  onEditPrefs,
}: {
  notifications: Notification[];
  prefs: NotificationPrefs;
  onOpen: (n: Notification) => void;
  onEditPrefs: () => void;
}) {
  if (notifications.length === 0) {
    return (
      <Screen testID="notifications-screen">
        <EmptyState
          testID="notifications-empty"
          title="Nothing new"
          body={
            allDisabled(prefs)
              ? 'All notification categories are turned off.'
              : 'You are all caught up.'
          }
          {...(allDisabled(prefs) ? { actionLabel: 'Notification settings', onAction: onEditPrefs } : {})}
        />
      </Screen>
    );
  }

  return (
    <Screen testID="notifications-screen">
      <FlatList
        testID="notification-list"
        data={notifications}
        keyExtractor={(n) => n.notificationId}
        contentContainerStyle={{ gap: theme.space.md }}
        renderItem={({ item, index }) => (
          <View testID={`notification-${index}`}>
            <Text
              accessibilityRole="button"
              onPress={() => onOpen(item)}
              style={{ fontSize: theme.font.md, color: theme.color.text }}
            >
              {describeNotification(item)}
            </Text>
          </View>
        )}
      />
    </Screen>
  );
}
