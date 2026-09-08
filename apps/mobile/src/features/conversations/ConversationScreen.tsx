import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { Conversation, Message } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle, MIN_TOUCH_TARGET } from '../../ui/theme';
import { Banner, Button, EmptyState, Field, Row, Screen } from '../../ui/primitives';
import { Avatar } from '../../components/Avatar';
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
        005/FR-019, FR-024. WHO IS IN HERE, on the screen. And 007/T052: `Conversation.dc.html` puts an
        avatar, a title and "N people" in a header bar.

        `group-participants` still carries the FULL roster, because 005/FR-019
        is that a group says who is in it and the header's count does not. It is
        below the header rather than in it, where the design puts a subtitle,
        and someone who left is still listed as having left: a group that
        silently loses a name has no way to explain a message from somebody who
        is no longer there.
      */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 11,
          paddingHorizontal: space.lg,
          paddingVertical: space.sm,
          borderBottomWidth: 1,
          borderBottomColor: palette.line.hairline,
        }}
      >
        <Avatar
          userId={conversation.conversationId}
          displayName={conversationTitle(conversation)}
          size={34}
        />
        <View style={{ flexGrow: 1, flexShrink: 1, gap: 1 }}>
          <Text
            numberOfLines={1}
            style={{ ...textStyle.body, fontWeight: '600', color: palette.text.primary }}
          >
            {conversationTitle(conversation)}
          </Text>
          {group ? (
            <Text style={{ ...textStyle.small, color: palette.text.muted }}>
              {`${(conversation.participants ?? []).filter((p) => p.state !== 'left').length} people`}
            </Text>
          ) : null}
        </View>
        {group && onLeave ? (
          <Button testID="leave-group" label="Leave" variant="danger" onPress={onLeave} />
        ) : null}
      </View>

      {group ? (
        <Text
          testID="group-participants"
          style={{
            ...textStyle.small,
            color: palette.text.muted,
            paddingHorizontal: space.lg,
            paddingTop: space.xs,
          }}
        >
          {(conversation.participants ?? [])
            .map((p) => (p.state === 'left' ? `${p.person.displayName} (left)` : p.person.displayName))
            .join(', ')}
        </Text>
      ) : null}

      {/* 005/FR-020. The id does not change when somebody is added (R1). */}
      {group && onAddParticipant ? (
        <Row style={{ paddingHorizontal: space.lg, gap: space.sm, paddingTop: space.sm }}>
          <Field
            testID="add-participant-input"
            accessibilityLabel="Add someone by handle"
            placeholder="Add someone by handle"
            value={addHandle ?? ''}
            onChangeText={onAddHandleChange ?? (() => undefined)}
            style={{ flexGrow: 1, flexShrink: 1 }}
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
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingTop: 14, gap: 12 }}
          renderItem={({ item }) => {
            const mine = item.authorId === viewerId;
            const removed = !item.body && item.moderationState === 'removed';
            return (
              <View
                testID={`message-${item.messageId}`}
                style={{
                  flexDirection: 'row',
                  gap: 9,
                  alignItems: 'flex-end',
                  justifyContent: mine ? 'flex-end' : 'flex-start',
                }}
              >
                {mine ? null : (
                  <Avatar userId={item.authorId} displayName={item.authorId} size={28} />
                )}

                <View style={{ maxWidth: 250, gap: space.xs, alignItems: mine ? 'flex-end' : 'flex-start' }}>
                  {item.body || removed ? (
                    <View
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        /**
                         * The artboard's asymmetric corner: a bubble is square
                         * on the side it was sent from, which is what makes a
                         * column of them readable without a name on each one.
                         */
                        borderRadius: 18,
                        borderBottomRightRadius: mine ? 5 : 18,
                        borderBottomLeftRadius: mine ? 18 : 5,
                        backgroundColor: mine ? palette.intent.accent : palette.bg.sunken,
                      }}
                    >
                      {item.body ? (
                        <Text
                          style={{
                            ...textStyle.body,
                            color: mine ? palette.text.onAccent : palette.text.primary,
                          }}
                        >
                          {item.body}
                        </Text>
                      ) : (
                        // Moderation removes CONTENT. Saying so beats an empty
                        // bubble, which reads as a bug to both people in the
                        // thread.
                        <Text
                          testID={`message-removed-${item.messageId}`}
                          style={{ ...textStyle.body, fontStyle: 'italic', color: palette.text.muted }}
                        >
                          This message was removed.
                        </Text>
                      )}
                    </View>
                  ) : null}

                  <SharedPostBubble message={item} onOpen={onOpenPost} />

                  {/*
                    Constitution IV: reporting is a release gate, not polish, so
                    it stays ON the message rather than behind a long press the
                    artboard does not draw either. It is a quiet text control
                    now instead of a filled button beside every bubble - the
                    affordance is unchanged and still one tap.
                  */}
                  {mine ? null : (
                    <Pressable
                      testID={`report-message-${item.messageId}`}
                      accessibilityRole="button"
                      accessibilityLabel="Report this message"
                      onPress={() => onReport(item.messageId)}
                      hitSlop={{ top: 14, bottom: 14, left: 12, right: 12 }}
                      style={{ minWidth: MIN_TOUCH_TARGET }}
                    >
                      <Text style={{ ...textStyle.small, color: palette.text.muted }}>Report</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          }}
        />
      )}

      {notice ? <Banner tone="info" testID="composer-notice">{notice}</Banner> : null}

      {/*
        `Conversation.dc.html`'s composer: a pill field and a round accent send
        button. The button carries a GLYPH and an accessibility label rather
        than the word "Send" — which is why the label is spelled out here: an
        icon-only control with no name is unusable with a screen reader, and
        that is the failure mode of every redesign that reaches for icons.
      */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: space.lg,
          paddingTop: space.md,
          paddingBottom: 18,
          backgroundColor: palette.bg.raised,
          borderTopWidth: 1,
          borderTopColor: palette.line.hairline,
        }}
      >
        <Field
          testID="message-input"
          accessibilityLabel="Message"
          placeholder="Message…"
          value={draft}
          editable={conversation.viewerCanSend}
          onChangeText={onDraftChange}
          style={{ flexGrow: 1, flexShrink: 1, minHeight: 42 }}
        />
        <Pressable
          testID="send-message"
          accessibilityRole="button"
          accessibilityLabel={sending ? 'Sending' : 'Send message'}
          accessibilityState={{ disabled: !canSend(draft) || !conversation.viewerCanSend || sending === true }}
          disabled={!canSend(draft) || !conversation.viewerCanSend || sending === true}
          onPress={onSend}
          style={{
            width: MIN_TOUCH_TARGET,
            height: MIN_TOUCH_TARGET,
            minHeight: MIN_TOUCH_TARGET,
            borderRadius: MIN_TOUCH_TARGET / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              canSend(draft) && conversation.viewerCanSend && sending !== true
                ? palette.intent.accent
                : palette.bg.sunken,
          }}
        >
          <Text
            style={{
              ...textStyle.body,
              color:
                canSend(draft) && conversation.viewerCanSend && sending !== true
                  ? palette.text.onAccent
                  : palette.text.muted,
            }}
          >
            {sending ? '···' : '➤'}
          </Text>
        </Pressable>
      </View>
    </Screen>
  );
}
