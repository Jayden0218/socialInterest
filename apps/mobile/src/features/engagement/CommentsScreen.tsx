import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { Comment } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle, touchTarget } from '../../ui/theme';
import { Banner, Button, EmptyState, Screen } from '../../ui/primitives';

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
  onDraftChange,
  onSubmit,
  onReplyTo,
}: {
  comments: Comment[];
  draft: string;
  status?: number;
  submitting?: boolean;
  /** 008/FR-023. The comment being answered, or null for a top-level one. */
  replyingTo?: Comment | null;
  onDraftChange: (next: string) => void;
  onSubmit: () => void;
  onReplyTo?: (comment: Comment | null) => void;
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
                <Text
                  testID={removed ? `comment-removed-${index}` : undefined}
                  style={{
                    ...textStyle.body,
                    color: removed ? palette.text.muted : palette.text.primary,
                    fontStyle: removed ? 'italic' : 'normal',
                  }}
                >
                  {removed ? REMOVED_COMMENT_TEXT : item.body}
                </Text>
                {/*
                  No reply control on a REPLY: nesting is bounded at one level
                  (FR-025), and offering a control whose result is silently
                  re-parented would explain the bound as a surprise instead of a
                  rule. Answering a reply is done from its parent.
                */}
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
        <Button
          testID="comment-submit"
          label={submitting ? 'Posting…' : 'Post'}
          disabled={!canSubmitComment(draft) || submitting === true}
          onPress={onSubmit}
        />
      </View>
    </Screen>
  );
}
