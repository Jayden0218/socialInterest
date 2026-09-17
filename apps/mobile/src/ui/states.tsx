import { Text, View } from 'react-native';
import { activePalette as palette, radius, space, textStyle, type, font } from './theme';
import { Button, EmptyState } from './primitives';
import { Icon } from './Icon';
import { Skeleton } from '../components/Skeleton';

/**
 * THE FOUR STATES A SURFACE CAN BE IN — 012/US1, FR-001 to FR-010.
 *
 * Before this feature, four of the five primary surfaces — Feed, Explore,
 * Activity, Chats — rendered NOTHING while their data loaded, and the app
 * contained no pull-to-refresh at all. So "still loading", "there is nothing"
 * and "that failed" were one blank rectangle, and an interface that shows
 * nothing while it works does not read as slow. It reads as broken.
 *
 * TWO OF THE THREE PIECES ALREADY EXISTED, and building a second copy of them
 * here would have been the defect this repository has recorded more than any
 * other. `EmptyState` lives in `primitives.tsx` and ~15 screens already call
 * it; `Skeleton` lives in `components/` and holds the "placeholder, never a
 * spinner" argument in its own comment. Both are used from here rather than
 * reimplemented — the task said "create Skeleton, EmptyState, FailedState" and
 * two thirds of it was already done.
 *
 * What is genuinely missing is `FailedState`, which is the whole point of
 * FR-009: a failure must be distinguishable from emptiness BY A PERSON, not
 * only by a developer reading a log.
 */

/**
 * A card-shaped placeholder — `States.dc.html`'s loading column.
 *
 * SHAPED LIKE WHAT REPLACES IT (FR-003). A centred spinner tells somebody that
 * something is happening and nothing about what is coming; this says "two
 * columns of photographs, about this big" and holds the space they will need,
 * so the list does not jump when they arrive.
 *
 * The varying heights are deliberate and come from the artboard: a waterfall of
 * identical rectangles reads as a table, which is not what is about to load.
 */
export function CardSkeleton({ mediaHeight }: { mediaHeight: number }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ backgroundColor: palette.bg.raised, borderRadius: radius.card, overflow: 'hidden' }}
    >
      <Skeleton style={{ height: mediaHeight, borderRadius: 0 }} />
      <View style={{ paddingHorizontal: space.sm, paddingTop: space.xs, paddingBottom: space.sm, gap: 7 }}>
        <Skeleton style={{ height: 11, width: '88%' }} />
        <Skeleton style={{ height: 11, width: '56%' }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Skeleton style={{ height: 9, width: '38%' }} />
          <Skeleton style={{ height: 9, width: '22%' }} />
        </View>
      </View>
    </View>
  );
}

/** The artboard's own sequence, so the two columns do not line up. */
const MEDIA_HEIGHTS = [150, 118, 120, 152, 134, 126];

/**
 * A screenful of card skeletons in the feed's two columns.
 *
 * Six, because that is what fits above the fold at the reference viewport and
 * a seventh would be a placeholder nobody sees.
 */
export function FeedSkeleton({ testID }: { testID?: string }) {
  const left = MEDIA_HEIGHTS.filter((_, i) => i % 2 === 0);
  const right = MEDIA_HEIGHTS.filter((_, i) => i % 2 === 1);
  return (
    <View testID={testID} style={{ flexDirection: 'row', gap: space.md, padding: space.md }}>
      {[left, right].map((column, c) => (
        <View key={c} style={{ flex: 1, gap: space.md }}>
          {column.map((h, i) => (
            <CardSkeleton key={i} mediaHeight={h} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** A row-shaped placeholder, for the list surfaces that are not the feed. */
export function ListSkeleton({ rows = 6, testID }: { rows?: number; testID?: string }) {
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ padding: space.md, gap: space.lg }}
    >
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Skeleton style={{ width: 38, height: 38, borderRadius: radius.pill }} />
          <View style={{ flex: 1, gap: 7 }}>
            <Skeleton style={{ height: 11, width: '62%' }} />
            <Skeleton style={{ height: 9, width: '34%' }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/**
 * SOMETHING WENT WRONG, AND IT IS NOT THE SAME AS NOTHING BEING THERE.
 *
 * FR-009 and FR-010. The distinction is the requirement: "no messages yet" for
 * a dropped connection is a lie that makes a person stop looking, and it is the
 * exact mistake `InboxContainer`'s own comment says its error branch exists to
 * prevent. Three things make it distinguishable at a glance — the danger colour,
 * a different icon, and a retry control that an empty state never has.
 *
 * The MESSAGE is passed in rather than composed here, because what failed is
 * the useful part ("Could not load messages" beats "Something went wrong") and
 * only the caller knows it.
 */
export function FailedState({
  message,
  onRetry,
  testID,
}: {
  message: string;
  onRetry: () => void;
  testID?: string;
}) {
  return (
    <View testID={testID} style={{ padding: space.xl, alignItems: 'center', gap: space.md }}>
      <Icon name="close" size="state" color={palette.intent.danger} />
      <Text style={{ ...textStyle.title, ...font(type.title.weight), color: palette.text.primary }}>
        Could not load
      </Text>
      {/*
        `text.secondary`, matching EmptyState's body for the same reason: this is
        the most useful line on the screen and the dimmest role available is the
        hardest one to read.
      */}
      <Text style={{ ...textStyle.body, color: palette.text.secondary, textAlign: 'center' }}>
        {message}
      </Text>
      <Button label="Try again" onPress={onRetry} testID="retry-action" />
    </View>
  );
}

export { EmptyState };
