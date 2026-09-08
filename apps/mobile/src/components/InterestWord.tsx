import { Pressable, Text } from 'react-native';
import type { InterestRef } from '@sih/shared';
import { interestColour } from '../ui/interest-colour';
import { useTheme } from '../ui/useTheme';
import { type as typeScale } from '../ui/tokens';

/**
 * 007/FR-024 — THE INTEREST IS A COLOURED WORD. Not a chip, not a badge, not a
 * pill, not a stamp.
 *
 * 006 rendered it as a tinted chip and that was the right call for THAT design.
 * The approved 007 design has exactly one quiet signature, and this is it: the
 * interest's name in its own colour, sitting under the card's title with no
 * container of its own. It colour-codes the whole feed so the eye can sort it
 * without anything shouting — which is what the owner asked for after rejecting
 * six passes for being too busy for something opened forty times a day.
 *
 * A chip has a background, a border and a radius; those three properties are
 * what `interest-is-a-word.test.ts` forbids on this component. Reintroducing
 * any of them is the one visual regression that would make every browse surface
 * look like the design that was rejected.
 *
 * THE NAME IS NOT OPTIONAL AND NEVER WILL BE (006/FR-014). The colour comes
 * from a hash of the id, so two unrelated interests can land on similar hues —
 * fine as reinforcement, fatal as identification. Colour narrows; the name says.
 * A sub-interest borrows its parent's hue (FR-012) because 001/FR-024 rolls its
 * posts into the parent, and unrelated colours would make the screen disagree
 * with the product.
 */
export function InterestWord({
  interest,
  onPress,
}: {
  interest: InterestRef;
  onPress?: (interestId: string) => void;
}) {
  const palette = useTheme();
  const colour = interestColour(
    { interestId: interest.interestId, parentId: interest.parent?.interestId ?? null },
    palette,
  );

  const word = (
    <Text
      style={{
        color: colour,
        fontSize: typeScale.small.size,
        lineHeight: typeScale.small.lineHeight,
        fontWeight: '600',
      }}
    >
      {interest.name}
    </Text>
  );

  /**
   * THE testID IS UNCHANGED FROM 006's CHIP, deliberately, and it is written
   * INLINE rather than hoisted to a variable.
   *
   * `contracts/testid-preservation.md` is about the id AND what it marks, and
   * what it marks is "the interest, on a post" — exactly what this still is.
   * Renaming it would break every Maestro selector to record a change of
   * rendering that no flow cares about. The COMPONENT is renamed, because
   * calling a word a chip is how the rejected design creeps back.
   *
   * Inline because `verify-maestro-ids.mjs` and `testid-snapshot.test.ts` read
   * a dynamic prefix off the LEADING LITERAL of a template in a `testID=`
   * position. A variable hides it and every `interest-chip-.*` selector then
   * matches nothing — 005 hit this exact blind spot and the guard was right
   * both times.
   */
  // Only a tappable word needs a tap target; a decorative one must not pretend
  // to be interactive (contracts/testid-preservation.md rule 6).
  if (!onPress) {
    return (
      <Text
        testID={`interest-chip-${interest.slug}`}
        style={{
          color: colour,
          fontSize: typeScale.small.size,
          lineHeight: typeScale.small.lineHeight,
          fontWeight: '600',
        }}
      >
        {interest.name}
      </Text>
    );
  }

  return (
    <Pressable
      testID={`interest-chip-${interest.slug}`}
      accessibilityRole="button"
      accessibilityLabel={interest.name}
      onPress={() => onPress(interest.interestId)}
      /**
       * `hitSlop`, NOT a 44pt minimum height — and the difference was 43 points
       * on every card in the feed.
       *
       * FR-017 needs a real target: one tap from a post to its interest space.
       * The first version used the shared `touchTarget`, which states
       * `minHeight: 44`, and a 16pt word then occupied 44 points of LAYOUT
       * inside a card whose whole text block should be about 90. Measured at
       * 360x640, that alone was the difference between two posts visible on the
       * feed and four (SC-008).
       *
       * `hitSlop` extends the touchable area OUTSIDE the layout box, which is
       * exactly the case it exists for: the art stays eleven and a half points
       * and the target is 44 in every direction.
       */
      hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
      style={{ alignSelf: 'flex-start' }}
    >
      {word}
    </Pressable>
  );
}
