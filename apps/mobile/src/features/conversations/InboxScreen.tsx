import { FlatList, Pressable, Text, View } from 'react-native';
import type { ConversationState, ConversationSummary } from '@sih/shared';
import { activePalette as palette, space, textStyle, type, MIN_TOUCH_TARGET } from '../../ui/theme';
import { EmptyState, Screen, ScreenHeader } from '../../ui/primitives';
import { Avatar } from '../../components/Avatar';
import { conversationSlug, conversationTitle, isGroup } from './conversation-title';

export const INBOXES: { key: ConversationState; label: string }[] = [
  { key: 'accepted', label: 'Messages' },
  { key: 'requested', label: 'Requests' },
];

/**
 * FR-036's shape, applied to two inboxes that are empty for different reasons.
 *
 * "No messages yet" and "no requests" are not the same state and must not read
 * the same: one invites you to start a conversation, the other is simply good
 * news.
 */
export function emptyInboxCopy(state: ConversationState): { title: string; body: string } {
  return state === 'requested'
    ? { title: 'No requests', body: 'Messages from people you do not follow will wait here.' }
    : {
        title: 'No messages yet',
        body: 'Open someone’s profile and tap Message to start a conversation.',
      };
}

/**
 * The artboard's `4m / 22m / 1h / Tue / Mon` column.
 *
 * Deliberately coarse, and deliberately not `Intl.RelativeTimeFormat`: this
 * renders inside a row on a list that scrolls, the design shows at most three
 * characters, and a formatter's locale output would be neither. Anything older
 * than a week is a date rather than a count, because "9d" is not a thing anyone
 * reads.
 */
export function relativeWhen(iso: string, now: number = Date.now()): string {
  const ms = now - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(iso).getDay()] ?? '';
  return `${days}d`;
}

/**
 * The tab strip from `Chats.dc.html`: a label, an optional count, and a 2.5pt
 * underline on the selected one.
 *
 * These were two `Button`s. The design's selected state is an underline rather
 * than a filled pill, and a filled pill next to an unfilled one reads as two
 * actions rather than one choice with two positions.
 */
function InboxTab({
  label,
  testID,
  selected,
  count,
  onPress,
}: {
  label: string;
  testID: string;
  selected: boolean;
  count?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={{ minHeight: MIN_TOUCH_TARGET, justifyContent: 'flex-end', gap: 9 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
        <Text
          style={{
            ...textStyle.body,
            fontWeight: selected ? '600' : '500',
            color: selected ? palette.text.primary : palette.text.muted,
          }}
        >
          {label}
        </Text>
        {count && count > 0 ? (
          <View
            style={{
              minWidth: 18,
              height: 18,
              paddingHorizontal: 6,
              borderRadius: 9,
              backgroundColor: palette.intent.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ ...textStyle.small, fontWeight: '700', color: palette.text.onAccent }}>
              {count}
            </Text>
          </View>
        ) : null}
      </View>
      <View
        style={{
          height: 2.5,
          borderRadius: 2,
          backgroundColor: selected ? palette.intent.accent : 'transparent',
        }}
      />
    </Pressable>
  );
}

/** FR-003, FR-010; rebuilt for 007/T052 against `design/007-ui/Chats.dc.html`. */
export function InboxScreen({
  state,
  conversations,
  onSelectInbox,
  onOpen,
  onNewGroup,
  requestCount,
}: {
  state: ConversationState;
  conversations: ConversationSummary[];
  onSelectInbox: (next: ConversationState) => void;
  onOpen: (conversation: ConversationSummary) => void;
  /** 005/FR-018. */
  onNewGroup?: () => void;
  /** The badge on the Requests tab. Absent when the caller has not counted. */
  requestCount?: number;
}) {
  const empty = emptyInboxCopy(state);
  return (
    <Screen testID="inbox-screen">
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <ScreenHeader
          title="Chats"
          right={
            onNewGroup ? (
              <Pressable
                testID="new-group"
                accessibilityRole="button"
                accessibilityLabel="New group"
                onPress={onNewGroup}
                style={{
                  minHeight: MIN_TOUCH_TARGET,
                  minWidth: MIN_TOUCH_TARGET,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ ...textStyle.title, color: palette.text.primary }}>＋</Text>
              </Pressable>
            ) : null
          }
        />
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: space.xl,
          paddingHorizontal: space.lg,
          borderBottomWidth: 1,
          borderBottomColor: palette.line.hairline,
        }}
      >
        {INBOXES.map((i) => (
          <InboxTab
            key={i.key}
            testID={`inbox-${i.key}`}
            label={i.label}
            selected={state === i.key}
            {...(i.key === 'requested' && requestCount ? { count: requestCount } : {})}
            onPress={() => onSelectInbox(i.key)}
          />
        ))}
      </View>

      {conversations.length === 0 ? (
        <EmptyState testID="inbox-empty" title={empty.title} body={empty.body} />
      ) : (
        <FlatList
          testID="inbox-list"
          data={conversations}
          keyExtractor={(c) => c.conversationId}
          renderItem={({ item }) => <ConversationRow conversation={item} onOpen={onOpen} />}
        />
      )}
    </Screen>
  );
}

function ConversationRow({
  conversation: item,
  onOpen,
}: {
  conversation: ConversationSummary;
  onOpen: (c: ConversationSummary) => void;
}) {
  const group = isGroup(item);
  const unread = item.unreadCount > 0;
  const title = conversationTitle(item);
  // Typed off the summary rather than a narrowing `in` check: `participants` is
  // optional on the schema, so `'participants' in item` narrows to `{}` and the
  // count silently becomes unreachable.
  const members = group ? ((item as { participants?: unknown[] }).participants ?? []).length : 0;

  /**
   * THE WHOLE ROW OPENS THE CONVERSATION, which is what the artboard shows and
   * what every messaging app does. The separate "Open" button is gone, but its
   * testID is NOT: `open-group-<slug>` and `open-conversation-<id>` are in the
   * Maestro flows and the testID snapshot (FR-027), so they move onto the row
   * that now carries the action rather than disappearing with the button.
   *
   * Two whole templates rather than one with the prefix interpolated, because
   * `verify-maestro-ids` reads dynamic prefixes off the LEADING LITERAL of a
   * template in a `testID=` position and cannot see through a ternary that
   * builds one. That is the same constraint the deleted button was written
   * under, and it did not go away.
   */
  const row = (
    <>
      <Avatar
        userId={item.other?.userId ?? item.conversationId}
        displayName={title}
        // A GROUP has no single other person, so no single face. The derived
        // disc, seeded by the conversation id, is the honest answer there.
        url={item.other?.avatarUrl ?? null}
        size={50}
      />

      <View style={{ flexGrow: 1, flexShrink: 1, gap: 3, minWidth: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
          {/*
            005/FR-024. A group row is found by WHO OR WHAT IT IS.

            `conversationTitle` is the group's name, or the people in it, and
            never the last message. The preview below is still shown - it is
            useful - but it identifies nothing, and the testID that a flow
            selects on is built from the title.

            That is not a style preference. 004's `14-message-request` waited on
            a seeded message's text in the inbox while `13-send-message` replied
            into the same conversation, so the preview correctly changed and the
            flow passed twice on Maestro's incidental ordering. A last-message
            preview is mutable by definition; assert on what identifies the row.
          */}
          {group ? (
            <Text
              testID={`group-row-${conversationSlug(item)}`}
              numberOfLines={1}
              style={{ ...textStyle.body, fontWeight: '600', color: palette.text.primary, flexShrink: 1 }}
            >
              {title}
            </Text>
          ) : (
            <Text
              testID={`conversation-title-${item.conversationId}`}
              numberOfLines={1}
              style={{ ...textStyle.body, fontWeight: '600', color: palette.text.primary, flexShrink: 1 }}
            >
              {title}
            </Text>
          )}
          {group && members > 0 ? (
            <Text style={{ ...textStyle.small, fontWeight: type.small.weight, color: palette.text.muted }}>
              {members}
            </Text>
          ) : null}
        </View>

        <Text
          numberOfLines={1}
          style={{
            ...textStyle.label,
            fontWeight: '400',
            color: unread ? palette.text.primary : palette.text.muted,
          }}
        >
          {item.lastMessagePreview ?? 'No messages yet'}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
        <Text style={{ ...textStyle.small, color: palette.text.muted }}>
          {relativeWhen(item.lastMessageAt)}
        </Text>
        {/*
          The artboard's unread mark is an 8pt DOT, not a number. The count is
          still exposed - `unread-<id>` is asserted by the journeys - as the
          dot's accessibility label, so the value survives where a sighted
          reader sees the design's mark and a screen reader hears the count.
        */}
        {unread ? (
          <View
            testID={`unread-${item.conversationId}`}
            accessibilityLabel={`${item.unreadCount} unread`}
            style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: palette.intent.accent }}
          />
        ) : (
          <View style={{ width: 8, height: 8 }} />
        )}
      </View>
    </>
  );

  // 72 points tall by construction: a 50pt avatar with 11 above and below. The
  // floor is stated anyway, so a later change to the avatar size cannot quietly
  // take the row under 44 — the guard cannot read this through a variable, so
  // the value has to be right rather than merely checked.
  const style = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 13,
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: space.lg,
    paddingVertical: 11,
  };

  return (
    <View testID={`conversation-${item.conversationId}`}>
      {group ? (
        <Pressable
          testID={`open-group-${conversationSlug(item)}`}
          accessibilityRole="button"
          accessibilityLabel={`Open ${title}`}
          onPress={() => onOpen(item)}
          style={style}
        >
          {row}
        </Pressable>
      ) : (
        <Pressable
          testID={`open-conversation-${item.conversationId}`}
          accessibilityRole="button"
          accessibilityLabel={`Open ${title}`}
          onPress={() => onOpen(item)}
          style={style}
        >
          {row}
        </Pressable>
      )}
    </View>
  );
}
