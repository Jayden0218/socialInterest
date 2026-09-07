import { View, type ViewStyle } from 'react-native';
import { useTheme } from '../ui/useTheme';
import { radius } from '../ui/tokens';

/**
 * 006/FR-023. A placeholder in the SHAPE of what will replace it.
 *
 * Not a spinner. A spinner on an empty screen tells a person that something is
 * happening and nothing about what is coming; a skeleton tells them a photograph
 * is about to be here and holds the space it will need, which is the other half
 * of FR-005.
 *
 * Deliberately static. An animated shimmer is a second render loop on every row
 * of a list, and this app's lists are the surface a device run measures.
 */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const palette = useTheme();
  return (
    <View
      // Hidden from assistive tech: it is the ABSENCE of content, and announcing
      // "placeholder" on every row of a loading feed is worse than silence.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ backgroundColor: palette.bg.sunken, borderRadius: radius.md, ...style }}
    />
  );
}
