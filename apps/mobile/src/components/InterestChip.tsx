import { Pressable, Text, View } from 'react-native';
import type { InterestRef } from '@sih/shared';
import { interestColour } from '../ui/interest-colour';
import { useTheme } from '../ui/useTheme';
import { radius, space, touchTarget, type as typeScale } from '../ui/tokens';

/**
 * 006/FR-013, FR-014. An interest, wearing its colour AND its name.
 *
 * The name is not optional and never will be. The colour comes from a hash of
 * the id, so two unrelated interests can land on similar hues - which is fine
 * as reinforcement and fatal as identification. Colour narrows; the name says.
 *
 * `parent` on the contract is a nested ref, so the parent's ID is what the
 * generator needs: a sub-interest takes its parent's hue (FR-012) because
 * 001/FR-024 rolls its posts into the parent, and unrelated colours would make
 * the screen disagree with the product.
 */
export function InterestChip({
  interest,
  onPress,
}: {
  interest: InterestRef;
  onPress?: (interestId: string) => void;
}) {
  const palette = useTheme();
  const background = interestColour(
    { interestId: interest.interestId, parentId: interest.parent?.interestId ?? null },
    palette,
  );

  const body = (
    <View
      style={{
        backgroundColor: background,
        paddingVertical: space.xs,
        paddingHorizontal: space.sm,
        borderRadius: radius.pill,
      }}
    >
      <Text
        style={{
          color: palette.text.onInterest,
          fontSize: typeScale.label.size,
          lineHeight: typeScale.label.lineHeight,
          fontWeight: typeScale.label.weight,
        }}
      >
        {interest.name}
      </Text>
    </View>
  );

  // Only a tappable chip needs a tap target; a decorative one must not pretend
  // to be interactive (contracts/testid-preservation.md rule 6).
  if (!onPress) return <View testID={`interest-chip-${interest.slug}`}>{body}</View>;

  return (
    <Pressable
      testID={`interest-chip-${interest.slug}`}
      accessibilityRole="button"
      accessibilityLabel={interest.name}
      onPress={() => onPress(interest.interestId)}
      style={touchTarget}
    >
      {body}
    </Pressable>
  );
}
