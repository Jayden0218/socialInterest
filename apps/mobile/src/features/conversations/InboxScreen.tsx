import { FlatList, Text, View } from 'react-native';
import type { ConversationState, ConversationSummary } from '@sih/shared';
import { theme } from '../../ui/theme';
import { Button, EmptyState, Row, Screen } from '../../ui/primitives';
import { conversationSlug, conversationTitle, isGroup } from './conversation-title';

const titleStyle = { color: theme.color.text, fontWeight: '600' } as const;

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

/** FR-003, FR-010. */
export function InboxScreen({
  state,
  conversations,
  onSelectInbox,
  onOpen,
  onNewGroup,
}: {
  state: ConversationState;
  conversations: ConversationSummary[];
  onSelectInbox: (next: ConversationState) => void;
  onOpen: (conversation: ConversationSummary) => void;
  /** 005/FR-018. */
  onNewGroup?: () => void;
}) {
  const empty = emptyInboxCopy(state);
  return (
    <Screen testID="inbox-screen">
      <Row style={{ gap: theme.space.sm, padding: theme.space.sm }}>
        {INBOXES.map((i) => (
          <Button
            key={i.key}
            testID={`inbox-${i.key}`}
            label={i.label}
            variant={state === i.key ? 'primary' : 'secondary'}
            onPress={() => onSelectInbox(i.key)}
          />
        ))}
        <View style={{ flex: 1 }} />
        {onNewGroup ? <Button testID="new-group" label="New group" onPress={onNewGroup} /> : null}
      </Row>

      {conversations.length === 0 ? (
        <EmptyState testID="inbox-empty" title={empty.title} body={empty.body} />
      ) : (
        <FlatList
          testID="inbox-list"
          data={conversations}
          keyExtractor={(c) => c.conversationId}
          renderItem={({ item }) => (
            <View
              testID={`conversation-${item.conversationId}`}
              style={{
                padding: theme.space.sm,
                borderBottomWidth: 1,
                borderBottomColor: theme.color.border,
              }}
            >
              <Row style={{ alignItems: 'center', gap: theme.space.sm }}>
                <View style={{ flex: 1 }}>
                  {/*
                    005/FR-024. A group row is found by WHO OR WHAT IT IS.

                    `conversationTitle` is the group's name, or the people in it,
                    and never the last message. The preview below is still shown -
                    it is useful - but it identifies nothing, and the testID that
                    a flow selects on is built from the title.

                    That is not a style preference. 004's `14-message-request`
                    waited on a seeded message's text in the inbox while
                    `13-send-message` replied into the same conversation, so the
                    preview correctly changed and the flow passed twice on
                    Maestro's incidental ordering. A last-message preview is
                    mutable by definition; assert on what identifies the row.
                  */}
                  {isGroup(item) ? (
                    <Text testID={`group-row-${conversationSlug(item)}`} style={titleStyle}>
                      {conversationTitle(item)}
                    </Text>
                  ) : (
                    <Text testID={`conversation-title-${item.conversationId}`} style={titleStyle}>
                      {conversationTitle(item)}
                    </Text>
                  )}
                  <Text numberOfLines={1} style={{ color: theme.color.muted }}>
                    {item.lastMessagePreview ?? 'No messages yet'}
                  </Text>
                </View>
                {item.unreadCount > 0 ? (
                  <Text testID={`unread-${item.conversationId}`} style={{ color: theme.color.text }}>
                    {item.unreadCount}
                  </Text>
                ) : null}
                {/*
                  A GROUP'S OPEN BUTTON IS IDENTIFIED BY THE GROUP, not by
                  position. `open-conversation-.*` matches whichever row a list
                  happens to render first, and by the time a device run reaches
                  the group flow there are several conversations - so a flow
                  selecting on it would open an arbitrary one and pass or fail on
                  incidental ordering. That is 004's `14-message-request` defect
                  in a new place.

                  Two whole templates rather than one with the prefix
                  interpolated, because `verify-maestro-ids` reads dynamic
                  prefixes off the LEADING LITERAL of a template in a `testID=`
                  position and cannot see through a ternary that builds one.
                */}
                {isGroup(item) ? (
                  <Button
                    testID={`open-group-${conversationSlug(item)}`}
                    label="Open"
                    variant="secondary"
                    onPress={() => onOpen(item)}
                  />
                ) : (
                  <Button
                    testID={`open-conversation-${item.conversationId}`}
                    label="Open"
                    variant="secondary"
                    onPress={() => onOpen(item)}
                  />
                )}
              </Row>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
