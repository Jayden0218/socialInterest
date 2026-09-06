import { FlatList, Text, TextInput, View } from 'react-native';
import type { Conversation, Message } from '@sih/shared';
import { theme } from '../../ui/theme';
import { Banner, Button, EmptyState, Row, Screen } from '../../ui/primitives';
import { SharedPostBubble } from './SharedPostBubble';

export const MAX_MESSAGE_LENGTH = 2000;

export function canSend(draft: string): boolean {
  const trimmed = draft.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_MESSAGE_LENGTH;
}

/**
 * What the composer says when the server will not accept a message.
 *
 * `viewerCanSend` comes from the SERVER - ConversationAccess decides it - so the
 * screen reflects an answer rather than guessing one. A client that decided this
 * for itself would be a second membership predicate, which is the thing
 * ConversationAccess exists to prevent.
 */
export function composerNotice(conversation: Conversation): string | null {
  if (conversation.viewerCanSend) return null;
  if (conversation.state === 'requested' && !conversation.initiatedByViewer) {
    return 'Accept this request to reply.';
  }
  if (conversation.state === 'requested') return 'Wait for a reply before sending again.';
  return 'You cannot send messages in this conversation.';
}

/** FR-001, FR-005, FR-009, FR-010, FR-011. */
export function ConversationScreen({
  conversation,
  messages,
  viewerId,
  draft,
  sending,
  onDraftChange,
  onSend,
  onAccept,
  onDecline,
  onOpenPost,
  onReport,
}: {
  conversation: Conversation;
  messages: Message[];
  viewerId: string;
  draft: string;
  sending?: boolean;
  onDraftChange: (next: string) => void;
  onSend: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onOpenPost: (postId: string) => void;
  onReport: (messageId: string) => void;
}) {
  const notice = composerNotice(conversation);
  // FR-005: only the RECIPIENT is offered accept/decline. Offering it to the
  // initiator would be a way to accept your own request.
  const showRequestControls =
    conversation.state === 'requested' && !conversation.initiatedByViewer;

  return (
    <Screen testID="conversation-screen">
      {showRequestControls ? (
        <Row style={{ padding: theme.space.sm, gap: theme.space.sm, alignItems: 'center' }}>
          <Text style={{ flex: 1, color: theme.color.muted }}>
            {conversation.other.displayName} wants to message you.
          </Text>
          <Button testID="accept-request" label="Accept" onPress={onAccept} />
          <Button testID="decline-request" label="Decline" variant="secondary" onPress={onDecline} />
        </Row>
      ) : null}

      {messages.length === 0 ? (
        <EmptyState
          testID="conversation-empty"
          title="No messages yet"
          body={`Say hello to ${conversation.other.displayName}.`}
        />
      ) : (
        <FlatList
          testID="message-list"
          data={messages}
          keyExtractor={(m) => m.messageId}
          renderItem={({ item }) => {
            const mine = item.authorId === viewerId;
            return (
              <View
                testID={`message-${item.messageId}`}
                style={{
                  padding: theme.space.sm,
                  gap: theme.space.xs,
                  alignItems: mine ? 'flex-end' : 'flex-start',
                }}
              >
                {item.body ? (
                  <Text style={{ color: theme.color.text }}>{item.body}</Text>
                ) : item.moderationState === 'removed' ? (
                  // Moderation removes CONTENT. Saying so beats an empty bubble,
                  // which reads as a bug to both people in the thread.
                  <Text testID={`message-removed-${item.messageId}`} style={{ color: theme.color.muted }}>
                    This message was removed.
                  </Text>
                ) : null}
                <SharedPostBubble message={item} onOpen={onOpenPost} />
                {mine ? null : (
                  <Button
                    testID={`report-message-${item.messageId}`}
                    label="Report"
                    variant="secondary"
                    onPress={() => onReport(item.messageId)}
                  />
                )}
              </View>
            );
          }}
        />
      )}

      {notice ? <Banner tone="info" testID="composer-notice">{notice}</Banner> : null}

      <Row style={{ padding: theme.space.sm, gap: theme.space.sm, alignItems: 'center' }}>
        <TextInput
          testID="message-input"
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: theme.color.border,
            borderRadius: 8,
            color: theme.color.text,
            padding: theme.space.sm,
          }}
          placeholder="Message"
          placeholderTextColor={theme.color.muted}
          value={draft}
          editable={conversation.viewerCanSend}
          onChangeText={onDraftChange}
        />
        <Button
          testID="send-message"
          label={sending ? 'Sending…' : 'Send'}
          disabled={!canSend(draft) || !conversation.viewerCanSend || sending === true}
          onPress={onSend}
        />
      </Row>
    </Screen>
  );
}
