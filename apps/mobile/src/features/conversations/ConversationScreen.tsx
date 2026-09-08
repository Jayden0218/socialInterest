import { FlatList, Text, TextInput, View } from 'react-native';
import type { Conversation, Message } from '@sih/shared';
import { activePalette as palette, space } from '../../ui/theme';
import { Banner, Button, EmptyState, Row, Screen } from '../../ui/primitives';
import { SharedPostBubble } from './SharedPostBubble';
import { conversationTitle, isGroup } from './conversation-title';

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
  onLeave,
  addHandle,
  onAddHandleChange,
  onAddParticipant,
  addError,
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
  /** 005/FR-021. Absent for a pair, where there is nothing to leave. */
  onLeave?: () => void;
  /** 005/FR-020. The handle to add, held by the container. */
  addHandle?: string;
  onAddHandleChange?: (next: string) => void;
  onAddParticipant?: () => void;
  /**
   * The SERVER's refusal, shown as it was worded.
   *
   * FR-023 refuses an add that would put a blocking pair in one group WITHOUT
   * naming who blocked whom, and SC-012 compares that response against another
   * "cannot add" refusal as literal responses. A client that substituted its own
   * friendlier copy here would be free to disclose exactly what the wording was
   * chosen to withhold.
   */
  addError?: string | null;
}) {
  const notice = composerNotice(conversation);
  // FR-005: only the RECIPIENT is offered accept/decline. Offering it to the
  // initiator would be a way to accept your own request.
  const showRequestControls =
    conversation.state === 'requested' && !conversation.initiatedByViewer;

  const group = isGroup(conversation);

  return (
    <Screen testID="conversation-screen">
      {/*
        005/FR-019, FR-024. WHO IS IN HERE, on the screen.

        A group is identified by its name or by its people, never by the last
        message - that is mutable by definition, and 004's flow-ordering defect
        was a test asserting on exactly that preview and passing only because of
        incidental ordering.

        Someone who left is listed as having left rather than dropped: a group
        that silently loses a name has no way to explain a message from somebody
        who is no longer there.
      */}
      {group ? (
        <Row style={{ paddingHorizontal: space.sm, gap: space.sm }}>
          <Text testID="group-participants" style={{ flex: 1, color: palette.text.muted }}>
            {(conversation.participants ?? [])
              .map((p) => (p.state === 'left' ? `${p.person.displayName} (left)` : p.person.displayName))
              .join(', ')}
          </Text>
          {onLeave ? (
            <Button testID="leave-group" label="Leave" variant="danger" onPress={onLeave} />
          ) : null}
        </Row>
      ) : null}

      {/* 005/FR-020. The id does not change when somebody is added (R1). */}
      {group && onAddParticipant ? (
        <Row style={{ paddingHorizontal: space.sm, gap: space.sm }}>
          <TextInput
            testID="add-participant-input"
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: palette.line.hairline,
              borderRadius: 8,
              color: palette.text.primary,
              padding: space.sm,
            }}
            placeholder="Add someone by handle"
            placeholderTextColor={palette.text.muted}
            autoCapitalize="none"
            value={addHandle ?? ''}
            onChangeText={onAddHandleChange}
          />
          <Button
            testID="add-participant"
            label="Add"
            variant="secondary"
            disabled={!(addHandle ?? '').trim()}
            onPress={onAddParticipant}
          />
        </Row>
      ) : null}

      {addError ? (
        <Banner tone="danger" testID="add-participant-error">
          {addError}
        </Banner>
      ) : null}

      {showRequestControls ? (
        <Row style={{ padding: space.sm, gap: space.sm, alignItems: 'center' }}>
          <Text style={{ flex: 1, color: palette.text.muted }}>
            {group
              ? `You were added to ${conversationTitle(conversation)}.`
              : `${conversationTitle(conversation)} wants to message you.`}
          </Text>
          <Button testID="accept-request" label="Accept" onPress={onAccept} />
          <Button testID="decline-request" label="Decline" variant="secondary" onPress={onDecline} />
        </Row>
      ) : null}

      {messages.length === 0 ? (
        <EmptyState
          testID="conversation-empty"
          title="No messages yet"
          body={`Say hello to ${conversationTitle(conversation)}.`}
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
                  padding: space.sm,
                  gap: space.xs,
                  alignItems: mine ? 'flex-end' : 'flex-start',
                }}
              >
                {item.body ? (
                  <Text style={{ color: palette.text.primary }}>{item.body}</Text>
                ) : item.moderationState === 'removed' ? (
                  // Moderation removes CONTENT. Saying so beats an empty bubble,
                  // which reads as a bug to both people in the thread.
                  <Text testID={`message-removed-${item.messageId}`} style={{ color: palette.text.muted }}>
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

      <Row style={{ padding: space.sm, gap: space.sm, alignItems: 'center' }}>
        <TextInput
          testID="message-input"
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: palette.line.hairline,
            borderRadius: 8,
            color: palette.text.primary,
            padding: space.sm,
          }}
          placeholder="Message"
          placeholderTextColor={palette.text.muted}
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
