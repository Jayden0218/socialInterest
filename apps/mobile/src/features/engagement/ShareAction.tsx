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
  onCopy,
  onShare,
}: {
  visibility: Visibility;
  url: string;
  onCopy: () => void;
  onShare: () => void;
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
    </View>
  );
}
