import { Text, View } from 'react-native';
import type { Message } from '@sih/shared';
import { theme } from '../../ui/theme';
import { Button } from '../../ui/primitives';

/**
 * FR-009. A shared post the reader may not see.
 *
 * Reusing 001's error distinction rather than inventing one: "gone" and "not for
 * you" are different things to a reader, and a block reads as "gone" precisely
 * so it is not disclosed.
 *
 * The alternative - rendering nothing - produces an empty bubble, which looks
 * like a bug and tells the reader nothing.
 */
export function unavailableCopy(reason: Message['sharedPostUnavailableReason']): string {
  return reason === 'gone' ? 'This post is no longer available.' : 'This post is not available to you.';
}

export function SharedPostBubble({
  message,
  onOpen,
}: {
  message: Message;
  onOpen: (postId: string) => void;
}) {
  if (!message.sharedPostId) return null;

  if (!message.sharedPost) {
    return (
      <View
        testID={`shared-post-unavailable-${message.messageId}`}
        style={{
          borderWidth: 1,
          borderColor: theme.color.border,
          borderRadius: 8,
          padding: theme.space.sm,
        }}
      >
        <Text style={{ color: theme.color.muted }}>
          {unavailableCopy(message.sharedPostUnavailableReason)}
        </Text>
      </View>
    );
  }

  return (
    <View
      testID={`shared-post-${message.messageId}`}
      style={{
        borderWidth: 1,
        borderColor: theme.color.border,
        borderRadius: 8,
        padding: theme.space.sm,
        gap: theme.space.xs,
      }}
    >
      <Text style={{ color: theme.color.text, fontWeight: '600' }}>
        {message.sharedPost.author.displayName}
      </Text>
      <Text numberOfLines={2} style={{ color: theme.color.muted }}>
        {message.sharedPost.caption ?? 'Shared a post'}
      </Text>
      <Button
        testID={`open-shared-post-${message.messageId}`}
        label="Open post"
        variant="secondary"
        onPress={() => onOpen(message.sharedPost!.postId)}
      />
    </View>
  );
}
