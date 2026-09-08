import { FlatList, Image, Text, View } from 'react-native';
import type { Notification } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle, type } from '../../ui/theme';
import { EmptyState, Screen, ScreenHeader } from '../../ui/primitives';
import { Avatar } from '../../components/Avatar';

import type { NotificationPrefs } from '../../data/session';

export type { NotificationPrefs };

/**
 * FR-048, FR-049; rebuilt for 007/T053 against `design/007-ui/Activity.dc.html`.
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
  // 004/FR-031. The fourth category, for the conversations US1 introduces. The
  // control itself has worked since 001 - only this row and the server enum are
  // new.
  { key: 'message', label: 'Messages' },
];

export function describeNotification(n: Notification): string {
  switch (n.kind) {
    case 'reaction':
      return `${n.actor.displayName} reacted to your post`;
    case 'comment':
      return `${n.actor.displayName} commented on your post`;
    case 'follow':
      return `${n.actor.displayName} followed you`;
    case 'message':
      return `${n.actor.displayName} sent you a message`;
  }
}

/**
 * The artboard's row reads "**who** did-what *when*", with the actor in the
 * text colour and the rest secondary. `describeNotification` is kept exactly as
 * it was because the journeys and three tests assert on its whole sentence -
 * this splits that sentence rather than replacing it, so a screen change cannot
 * quietly alter what those assertions read.
 */
export function splitNotification(n: Notification): { who: string; what: string } {
  const whole = describeNotification(n);
  const who = n.actor.displayName;
  return { who, what: whole.startsWith(who) ? whole.slice(who.length).trimStart() : whole };
}

export function allDisabled(prefs: NotificationPrefs): boolean {
  return !prefs.reaction && !prefs.comment && !prefs.follow && !prefs.message;
}

/**
 * "This week" in the artboard is a section label over the whole list. The
 * design shows one group and the data has no grouping key, so this states the
 * period the list covers rather than inventing buckets the server does not
 * send - a heading that claims a grouping the data cannot support is worse than
 * no heading.
 */
function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        ...textStyle.caption,
        fontWeight: '700',
        letterSpacing: 0.7,
        color: palette.text.muted,
        paddingHorizontal: space.md,
        paddingTop: space.sm,
        paddingBottom: space.xs,
      }}
    >
      {children.toUpperCase()}
    </Text>
  );
}

function NotificationRow({
  notification,
  index,
  onOpen,
}: {
  notification: Notification;
  index: number;
  onOpen: (n: Notification) => void;
}) {
  const { who, what } = splitNotification(notification);
  return (
    <View
      testID={`notification-${index}`}
      accessibilityRole="button"
      accessibilityLabel={describeNotification(notification)}
      onTouchEnd={() => onOpen(notification)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.sm,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
      }}
    >
      <Avatar userId={notification.actor.userId} displayName={notification.actor.displayName} size={42} />

      <Text
        accessibilityRole="button"
        onPress={() => onOpen(notification)}
        style={{ ...textStyle.label, fontWeight: type.label.weight, color: palette.text.secondary, flexGrow: 1, flexShrink: 1 }}
      >
        <Text style={{ fontWeight: '600', color: palette.text.primary }}>{who}</Text>
        {` ${what}`}
      </Text>

      {notification.postThumbUrl ? (
        <Image
          testID={`notification-thumb-${index}`}
          source={{ uri: notification.postThumbUrl }}
          accessibilityIgnoresInvertColors
          style={{
            width: 42,
            height: 42,
            borderRadius: radius.button,
            backgroundColor: palette.bg.sunken,
            flexShrink: 0,
          }}
        />
      ) : null}
    </View>
  );
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
      <Screen testID="notifications-screen" padded>
        <ScreenHeader title="Activity" />
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
      <View style={{ paddingHorizontal: space.md, paddingTop: space.sm }}>
        <ScreenHeader title="Activity" />
      </View>
      <FlatList
        testID="notification-list"
        data={notifications}
        keyExtractor={(n) => n.notificationId}
        ListHeaderComponent={<SectionLabel>This week</SectionLabel>}
        renderItem={({ item, index }) => (
          <NotificationRow notification={item} index={index} onOpen={onOpen} />
        )}
      />
    </Screen>
  );
}
