import { FlatList, Text, TextInput, View } from 'react-native';
import type { Comment } from '@sih/shared';
import { theme } from '../../ui/theme';
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

export function CommentsScreen({
  comments,
  draft,
  status,
  submitting,
  onDraftChange,
  onSubmit,
}: {
  comments: Comment[];
  draft: string;
  status?: number;
  submitting?: boolean;
  onDraftChange: (next: string) => void;
  onSubmit: () => void;
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
          contentContainerStyle={{ gap: theme.space.md }}
          renderItem={({ item, index }) => (
            <View testID={`comment-${index}`} style={{ gap: theme.space.xs }}>
              <Text style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
                {item.author.displayName}
              </Text>
              <Text style={{ fontSize: theme.font.md, color: theme.color.text }}>{item.body}</Text>
            </View>
          )}
        />
      )}

      <View style={{ gap: theme.space.sm }}>
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
            borderColor: theme.color.border,
            borderRadius: theme.radius.md,
            padding: theme.space.md,
            color: theme.color.text,
            fontSize: theme.font.md,
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
