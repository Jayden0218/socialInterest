import { Text, View } from 'react-native';
import type { Visibility } from '@sih/shared';
import { theme } from '../../ui/theme';
import { Banner, Button } from '../../ui/primitives';

/**
 * FR-041, FR-042. A share link grants nothing — it resolves against the post's
 * visibility every time. So the sheet warns BEFORE the person sends it, rather
 * than letting them find out from a confused recipient that the link did not
 * open.
 */
export function shareWarning(visibility: Visibility): string | null {
  switch (visibility) {
    case 'public':
      return null;
    case 'followers':
      return 'Only your followers can open this link.';
    case 'private':
      return 'This post is private. Nobody else can open this link.';
  }
}

export function isShareable(visibility: Visibility): boolean {
  return visibility !== 'private';
}

export function ShareAction({
  visibility,
  url,
  conversations,
  onCopy,
  onShare,
  onSendToConversation,
}: {
  visibility: Visibility;
  url: string;
  /** 004/FR-009. Empty when there is nobody to send to yet. */
  conversations?: { conversationId: string; displayName: string }[];
  onCopy: () => void;
  onShare: () => void;
  onSendToConversation?: (conversationId: string) => void;
}) {
  const warning = shareWarning(visibility);

  return (
    <View testID="share-action" style={{ gap: theme.space.md }}>
      <Text testID="share-url" numberOfLines={1} style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
        {url}
      </Text>

      {warning ? (
        <Banner tone="warning" testID="share-warning">{warning}</Banner>
      ) : null}

      <Button testID="share-copy" label="Copy link" variant="secondary" onPress={onCopy} />
      <Button
        testID="share-send"
        label="Share"
        disabled={!isShareable(visibility)}
        onPress={onShare}
      />

      {/*
        004/FR-009. Sending a post INTO a conversation is not the same as sharing
        a link: the post is a reference the recipient's own visibility is
        evaluated against at read time, so it can stop resolving later. The link
        warning above still applies for the same reason, which is why this sits
        under it rather than replacing it.
      */}
      {onSendToConversation && conversations && conversations.length > 0 ? (
        <View testID="share-to-conversations" style={{ gap: theme.space.xs }}>
          <Text style={{ fontSize: theme.font.sm, color: theme.color.muted }}>Send to</Text>
          {conversations.map((c) => (
            <Button
              key={c.conversationId}
              testID={`share-to-${c.conversationId}`}
              label={c.displayName}
              variant="secondary"
              disabled={!isShareable(visibility)}
              onPress={() => onSendToConversation(c.conversationId)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}
