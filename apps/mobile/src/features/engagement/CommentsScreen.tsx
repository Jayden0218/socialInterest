import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { Comment, PublicProfile } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle, touchTarget } from '../../ui/theme';
import { Banner, Button, EmptyState, Screen } from '../../ui/primitives';
import { MentionText } from '../../components/MentionText';
import { MentionSuggest } from '../../components/MentionSuggest';

export const MAX_COMMENT_LENGTH = 1000;

export function canSubmitComment(draft: string): boolean {
  const trimmed = draft.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_COMMENT_LENGTH;
}

/**
 * FR-040. A 403 here means the POST is not readable, not that comments are
 * closed — so the screen says so and sends the person back, rather than showing
 * an empty thread that would imply the post exists with nothing on it.
 */
export function messageForStatus(status: number): string | null {
  if (status === 403) return 'This post is not available to you.';
  if (status === 404) return 'This post is no longer available.';
  return null;
}

/**
 * 008/FR-026. What a removed comment says, in ONE place.
 *
 * The server sends `body: null` rather than a sentence, precisely so the wording
 * lives here and two surfaces cannot word a removal differently.
 */
export const REMOVED_COMMENT_TEXT = 'This comment was removed.';

export function CommentsScreen({
  comments,
  draft,
  status,
  submitting,
  replyingTo,
  editing,
  viewerId,
  onDraftChange,
  onSubmit,
  onReplyTo,
  onEdit,
  onDelete,
  onOpenPerson,
  mentionMatches,
  onChooseMention,
}: {
  comments: Comment[];
  draft: string;
  status?: number;
  submitting?: boolean;
  /** 008/FR-023. The comment being answered, or null for a top-level one. */
  replyingTo?: Comment | null;
  /** 008/FR-027. The comment being corrected, or null. */
  editing?: Comment | null;
  /**
   * 008/FR-029. Whose comments carry the edit and delete controls.
   *
   * Absent means show none — a signed-out reader owns nothing. This decides
   * what is DRAWN and nothing else: the server checks the author on every
   * request, because the app's rendering says nothing about what a modified
   * client can send.
   */
  viewerId?: string;
  onDraftChange: (next: string) => void;
  onSubmit: () => void;
  onReplyTo?: (comment: Comment | null) => void;
  onEdit?: (comment: Comment | null) => void;
  onDelete?: (comment: Comment) => void;
  /** 008/FR-030. Opens a person named in a comment. */
  onOpenPerson?: (handle: string) => void;
  /** 008/FR-030. People matching the handle being typed, if any. */
  mentionMatches?: PublicProfile[];
  onChooseMention?: (handle: string) => void;
}) {
  const blocked = status ? messageForStatus(status) : null;

  if (blocked) {
    return (
      <Screen testID="comments-screen">
        <Banner tone="warning" testID="comments-blocked">{blocked}</Banner>
      </Screen>
    );
  }

  return (
    <Screen testID="comments-screen">
      {comments.length === 0 ? (
        <EmptyState testID="comments-empty" title="No comments yet" body="Be the first to say something." />
      ) : (
        <FlatList
          testID="comment-list"
          data={comments}
          keyExtractor={(c) => c.commentId}
          contentContainerStyle={{ gap: space.md }}
          renderItem={({ item, index }) => {
            const isReply = Boolean(item.parentCommentId);
            const removed = item.body === null;
            const mine = Boolean(viewerId) && item.author.userId === viewerId;
            return (
              <View
                testID={`comment-${index}`}
                // FR-024. A reply is INDENTED under the comment it answers. The
                // server has already ordered parent-then-replies, so the indent
                // is the only thing the client contributes to the grouping —
                // and the ordering cannot drift from it, because it is not
                // recomputed here.
                style={{ gap: space.xs, marginLeft: isReply ? space.lg : 0 }}
              >
                <Text style={{ ...textStyle.caption, color: palette.text.muted }}>
                  {item.author.displayName}
                </Text>
                {removed ? (
                  <Text
                    testID={`comment-removed-${index}`}
                    style={{ ...textStyle.body, color: palette.text.muted, fontStyle: 'italic' }}
                  >
                    {REMOVED_COMMENT_TEXT}
                  </Text>
                ) : (
                  // 008/FR-030. @handles are tappable in a comment too.
                  <MentionText
                    text={item.body ?? ''}
                    style={{ ...textStyle.body, color: palette.text.primary }}
                    {...(onOpenPerson ? { onOpenPerson } : {})}
                  />
                )}
                {/*
                  No reply control on a REPLY: nesting is bounded at one level
                  (FR-025), and offering a control whose result is silently
                  re-parented would explain the bound as a surprise instead of a
                  rule. Answering a reply is done from its parent.
                */}
                {item.editedAt ? (
                  <Text
                    testID={`comment-edited-${index}`}
                    style={{ ...textStyle.caption, color: palette.text.muted }}
                  >
                    Edited
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', gap: space.md }}>
                  {onReplyTo && !isReply && !removed ? (
                    <Pressable
                      testID={`comment-reply-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Reply to ${item.author.displayName}`}
                      onPress={() => onReplyTo(item)}
                      style={{ ...touchTarget, minWidth: undefined, alignItems: 'flex-start' }}
                    >
                      <Text style={{ ...textStyle.caption, color: palette.intent.accent }}>Reply</Text>
                    </Pressable>
                  ) : null}
                  {/*
                    008/FR-029. Only on your OWN comment, and only while there is
                    still text to correct — a moderator's removal is not yours to
                    undo, and the server refuses it either way.
                  */}
                  {mine && !removed && onEdit ? (
                    <Pressable
                      testID={`comment-edit-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel="Edit your comment"
                      onPress={() => onEdit(item)}
                      style={{ ...touchTarget, minWidth: undefined, alignItems: 'flex-start' }}
                    >
                      <Text style={{ ...textStyle.caption, color: palette.intent.accent }}>Edit</Text>
                    </Pressable>
                  ) : null}
                  {mine && !removed && onDelete ? (
                    <Pressable
                      testID={`comment-delete-${index}`}
                      accessibilityRole="button"
                      accessibilityLabel="Delete your comment"
                      onPress={() => onDelete(item)}
                      style={{ ...touchTarget, minWidth: undefined, alignItems: 'flex-start' }}
                    >
                      <Text style={{ ...textStyle.caption, color: palette.intent.accent }}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            );
          }}
        />
      )}

      <View style={{ gap: space.sm }}>
        {/*
          Who is being answered, with a way out. Without it the composer is a
          mode a person can be in without knowing — the reply would land under
          somebody they had stopped thinking about.
        */}
        {editing && onEdit ? (
          <View
            testID="edit-banner"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={{ ...textStyle.caption, color: palette.text.muted }}>
              Correcting your comment
            </Text>
            <Pressable
              testID="edit-cancel"
              accessibilityRole="button"
              accessibilityLabel="Stop editing"
              onPress={() => onEdit(null)}
              style={{ ...touchTarget, minWidth: undefined, alignItems: 'flex-end' }}
            >
              <Text style={{ ...textStyle.caption, color: palette.intent.accent }}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
        {replyingTo && onReplyTo ? (
          <View
            testID="reply-banner"
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={{ ...textStyle.caption, color: palette.text.muted }}>
              {`Replying to ${replyingTo.author.displayName}`}
            </Text>
            <Pressable
              testID="reply-cancel"
              accessibilityRole="button"
              accessibilityLabel="Stop replying"
              onPress={() => onReplyTo(null)}
              style={{ ...touchTarget, minWidth: undefined, alignItems: 'flex-end' }}
            >
              <Text style={{ ...textStyle.caption, color: palette.intent.accent }}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}
        <TextInput
          testID="comment-input"
          accessibilityLabel="Write a comment"
          placeholder="Write a comment"
          value={draft}
          onChangeText={onDraftChange}
          maxLength={MAX_COMMENT_LENGTH}
          multiline
          style={{
            borderWidth: 1,
            borderColor: palette.line.hairline,
            borderRadius: radius.md,
            padding: space.md,
            color: palette.text.primary,
            ...textStyle.body,
          }}
        />
        {/* Above the button and below the field: it must not cover what is
            being typed, and it must not push the submit off a short screen —
            006 measured a safety control at 665px on a 640px screen. */}
        {mentionMatches && onChooseMention ? (
          <MentionSuggest people={mentionMatches} onChoose={onChooseMention} />
        ) : null}
        <Button
          testID="comment-submit"
          label={submitting ? 'Posting…' : editing ? 'Save' : 'Post'}
          disabled={!canSubmitComment(draft) || submitting === true}
          onPress={onSubmit}
        />
      </View>
    </Screen>
  );
}
