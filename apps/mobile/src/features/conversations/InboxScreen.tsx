import { FlatList, Text, View } from 'react-native';
import type { ConversationState, ConversationSummary } from '@sih/shared';
import { theme } from '../../ui/theme';
import { Button, EmptyState, Row, Screen } from '../../ui/primitives';

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
}: {
  state: ConversationState;
  conversations: ConversationSummary[];
  onSelectInbox: (next: ConversationState) => void;
  onOpen: (conversation: ConversationSummary) => void;
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
                  <Text style={{ color: theme.color.text, fontWeight: '600' }}>
                    {item.other.displayName}
                  </Text>
                  <Text numberOfLines={1} style={{ color: theme.color.muted }}>
                    {item.lastMessagePreview ?? 'No messages yet'}
                  </Text>
                </View>
                {item.unreadCount > 0 ? (
                  <Text testID={`unread-${item.conversationId}`} style={{ color: theme.color.text }}>
                    {item.unreadCount}
                  </Text>
                ) : null}
                <Button
                  testID={`open-conversation-${item.conversationId}`}
                  label="Open"
                  variant="secondary"
                  onPress={() => onOpen(item)}
                />
              </Row>
            </View>
          )}
        />
      )}
    </Screen>
  );
}
