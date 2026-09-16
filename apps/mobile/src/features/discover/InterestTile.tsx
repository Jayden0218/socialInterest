import { Pressable, Text, View } from 'react-native';
import type { Interest } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle } from '../../ui/theme';
import { interestColour } from '../../ui/interest-colour';
import { Photo } from '../../ui/Photo';

/**
 * 012/FR-031, FR-032. AN INTEREST YOU CAN SIZE UP WITHOUT OPENING IT.
 *
 * `Explore.dc.html`: a 2x2 photo mosaic, the name in the interest's own colour,
 * and "N posts" underneath. The spec says why — "the interest list is twelve
 * names and twelve dots with nothing to say how much is behind any of them", so
 * "choosing is guessing". The mosaic answers "what does this look like" and the
 * count answers "is anybody here"; a dot answered neither.
 *
 * THE MOSAIC HOLDS ITS SHAPE WHETHER THERE ARE FOUR PHOTOGRAPHS OR NONE. Four
 * fixed cells, filled in order, each one a `Photo` — so a tile is the same size
 * in a loading, full, sparse or failed state and a grid of them does not reflow
 * as pictures arrive. `Photo` draws the per-cell states (012/FR-006a); this
 * component decides only how many cells there are.
 */
export const MOSAIC_CELL = 44;

export function InterestTile({
  interest,
  onPress,
  testID,
}: {
  interest: Interest;
  onPress: () => void;
  testID: string;
}) {
  const colour = interestColour({ interestId: interest.interestId }, palette);
  const preview = interest.preview ?? [];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      // One label for the whole tile: a screen reader announcing four unlabelled
      // images and then a name would read the decoration before the thing.
      accessibilityLabel={`${interest.name}, ${postCountLabel(interest.postCount)}`}
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: palette.bg.raised,
        borderRadius: radius.md,
        overflow: 'hidden',
        // A DECLARED height, not one inferred from the mosaic. The tile is two
        // 44pt rows of photographs plus a name and a count, so it is never near
        // the 44pt floor — but the touch-target guard reads the style rather
        // than the layout, correctly refused this control for having no size of
        // its own, and "it is obviously big" is the argument that guard exists
        // to stop accepting.
        minHeight: MOSAIC_CELL * 2,
      }}
    >
      <View
        testID={`${testID}-mosaic`}
        // Hidden from assistive tech: the tile's own label already names the
        // interest, and four photographs with no captions are decoration here.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ flexDirection: 'row', flexWrap: 'wrap', height: MOSAIC_CELL * 2 }}
      >
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ width: '50%', height: MOSAIC_CELL, padding: 0.5 }}>
            <Photo
              testID={`${testID}-cell-${i}`}
              uri={preview[i] ?? null}
              style={{ width: '100%', height: '100%' }}
            />
          </View>
        ))}
      </View>

      <View style={{ padding: space.sm, gap: 3 }}>
        {/*
          006/FR-013 and 007. THE NAME IS THE COLOURED WORD, which is the
          treatment reserved for interests and for nothing else
          (`interest-treatment.test.ts`). The testID keeps the `interest-chip-`
          prefix every Maestro flow and the preservation contract already use.
        */}
        <Text
          testID={`interest-chip-${interest.slug}`}
          numberOfLines={1}
          style={{ ...textStyle.label, color: colour }}
        >
          {interest.name}
        </Text>
        <Text
          testID={`${testID}-count`}
          style={{ ...textStyle.small, color: palette.text.muted }}
        >
          {postCountLabel(interest.postCount)}
        </Text>
      </View>
    </Pressable>
  );
}

/**
 * "1 post", "1,204 posts".
 *
 * Singular matters more than it looks: "1 posts" on a brand-new interest is the
 * first thing a person sees after creating one, and the product's whole premise
 * is that they just made it.
 */
export function postCountLabel(count: number): string {
  return `${count.toLocaleString('en-US')} ${count === 1 ? 'post' : 'posts'}`;
}
