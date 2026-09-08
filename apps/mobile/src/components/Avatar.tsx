import { Text, View } from 'react-native';
import { oklch, stableHash } from '../ui/color';
import { useTheme } from '../ui/useTheme';
import { radius, type as typeScale } from '../ui/tokens';

/**
 * 006/FR-009, FR-010, R5. A person, visible wherever they are named.
 *
 * GENERATED, NEVER FETCHED. There is no avatar upload in this product, and
 * adding one is storage, moderation and an endpoint - a separate feature. A
 * stable generated avatar meets the requirement now and is replaced by an image
 * later without touching a single call site.
 *
 * No third-party service (G3). Gravatar and friends would leak an identifier to
 * someone else on every render, in a product whose constitution is largely about
 * not disclosing things.
 *
 * The colour uses the same generator as an interest's, seeded by `userId`, so a
 * person looks the same on every screen and every device.
 */
export function Avatar({
  userId,
  displayName,
  size = 36,
}: {
  userId: string;
  displayName: string;
  size?: number;
}) {
  const palette = useTheme();
  const hue = stableHash(userId) % 360;
  const background = oklch(palette.interest.l, palette.interest.c, hue);

  /**
   * The first CHARACTER, taken with the spread operator rather than `[0]`.
   *
   * `'😀name'[0]` is half a surrogate pair and renders as a replacement glyph;
   * spreading a string iterates code points. Names are not all Latin, and a
   * broken first letter is the kind of thing that only shows up for the people
   * least likely to be in a test fixture.
   */
  const initial = ([...displayName.trim()][0] ?? '?').toUpperCase();

  return (
    <View
      testID={`avatar-${userId}`}
      /**
       * NOT hidden from accessibility, and that is a deliberate trade.
       *
       * Hiding it is the textbook answer for a decorative avatar sitting beside
       * the name it duplicates. But an element hidden from accessibility is also
       * invisible to `getByTestId` and to Maestro, so the testID would be one no
       * test and no device flow could ever select - a handle that looks usable
       * and is not.
       *
       * The initial letter inside IS noise, so that is hidden instead. A screen
       * reader meets an empty container, which is harmless, and the name is read
       * once from the Text beside it.
       */
      style={{
        width: size,
        height: size,
        borderRadius: radius.pill,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        /**
         * The ONE place in the app where font scaling is turned off (FR-021).
         *
         * The circle is a fixed `size`, and this glyph is sized from it - so at
         * a large accessibility font setting the letter grows and the circle
         * does not, and the initial spills out of its own disc. That is a
         * device-only symptom: react-native-web ignores the platform setting,
         * so no screenshot here would ever show it.
         *
         * Switching it off is right rather than expedient because this letter
         * is NOT content. It is a decorative stand-in for a face, hidden from
         * assistive tech two lines above; the name it stands for sits beside it
         * as real text and scales normally. Nobody reads an avatar.
         */
        allowFontScaling={false}
        style={{
          color: palette.text.onInterest,
          fontSize: Math.round(size * 0.42),
          lineHeight: Math.round(size * 0.5),
          fontWeight: typeScale.label.weight,
        }}
      >
        {initial}
      </Text>
    </View>
  );
}
