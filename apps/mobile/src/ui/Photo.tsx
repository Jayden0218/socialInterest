import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View, type ImageResizeMode, type ViewStyle } from 'react-native';
import { Skeleton } from '../components/Skeleton';
import { Icon } from './Icon';
import { useTheme } from './useTheme';
import { MIN_TOUCH_TARGET, space, textStyle } from './tokens';

/**
 * 012/FR-006a. THE FOUR-STATE RULE, APPLIED TO A PHOTOGRAPH.
 *
 * Research R3 is blunt about why this exists: "the single most damaging thing in
 * the feed capture. Six cards, six empty grey boxes, on a product whose entire
 * premise is photographs." Two causes were found and must not be conflated —
 * object storage was unreachable where the capture ran, AND the app had no state
 * for a picture that does not arrive. The second is a product gap on any
 * network, and it is this file.
 *
 * WHAT A BARE `<Image>` DOES NOT GIVE YOU. The call sites already handled the
 * two states they could see from the OUTSIDE — no url yet, and a post whose
 * media failed to process — and then mounted an `Image` that has three more
 * states of its own with nothing drawn for any of them: fetching, fetched, and
 * refused. A 403 on an expired presigned url and a photograph that simply has
 * not arrived yet render identically as the component's background, which is
 * the same rectangle in both cases. That is FR-001's rule, one layer down.
 *
 * THE PLACEHOLDER SITS UNDERNEATH, NOT INSTEAD. The image is mounted from the
 * first render and the skeleton is drawn over it until `onLoad` fires. Swapping
 * one for the other would unmount and remount the `Image` on every state
 * change, which restarts the fetch — a loading state that makes loading slower.
 *
 * NOT USED BY `Avatar`, deliberately. An avatar that does not load falls back to
 * a letter, which is better than a placeholder and is its own contract; 006
 * records why that glyph is the one place font scaling is switched off.
 */
export function Photo({
  uri,
  accessibilityLabel,
  testID,
  resizeMode = 'cover',
  style,
  /**
   * Drawn in place of the photograph when there is nothing to show at all.
   *
   * Distinct from a FAILED fetch on purpose: "this post has no image" and "this
   * image would not load" are different facts, and a single grey box for both
   * is exactly what R3 found.
   */
  absent,
}: {
  uri: string | null | undefined;
  accessibilityLabel?: string;
  testID?: string;
  resizeMode?: ImageResizeMode;
  style?: ViewStyle;
  absent?: string;
}) {
  const palette = useTheme();
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  /**
   * A RETRY IS A NEW `Image`, and the only way to get one is a new key.
   *
   * RN caches by uri, and re-rendering the same element after an error does not
   * re-request. Bumping this remounts it, which is what "try again" has to mean.
   */
  const [attempt, setAttempt] = useState(0);

  // A changed uri is a different photograph, so the state it carried is not
  // about this one. Without this, scrolling a recycled row shows the previous
  // row's failure over the new row's image.
  useEffect(() => {
    setState('loading');
  }, [uri]);

  const frame: ViewStyle = {
    backgroundColor: palette.bg.sunken,
    overflow: 'hidden',
    ...style,
  };

  if (!uri) {
    return (
      <View testID={testID ? `${testID}-absent` : undefined} style={{ ...frame, ...CENTRE }}>
        <Icon name="camera" size="state" color={palette.text.muted} />
        {absent ? (
          <Text style={{ ...textStyle.small, color: palette.text.muted, textAlign: 'center' }}>
            {absent}
          </Text>
        ) : null}
      </View>
    );
  }

  if (state === 'failed') {
    return (
      <View testID={testID ? `${testID}-failed` : undefined} style={{ ...frame, ...CENTRE }}>
        <Text style={{ ...textStyle.small, color: palette.text.muted, textAlign: 'center' }}>
          This photo would not load.
        </Text>
        <Pressable
          testID={testID ? `${testID}-retry` : undefined}
          accessibilityRole="button"
          accessibilityLabel="Try loading this photo again"
          // The touch target is the row, not the words: a 12pt link inside a
          // photo frame is the shape 007 measured at 36.7 against a comment
          // claiming 44.
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          // A DECLARED minWidth, not the words' own width. The touch-target
          // guard does the arithmetic on this pair and refuses a `hitSlop` it
          // cannot measure — which is how it refused the first version of this
          // control, correctly.
          style={{ alignSelf: 'center', minWidth: MIN_TOUCH_TARGET, alignItems: 'center' }}
          onPress={() => {
            setAttempt((n) => n + 1);
            setState('loading');
          }}
        >
          <Text style={{ ...textStyle.small, color: palette.intent.accent }}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={frame}>
      <Image
        key={`${uri}#${attempt}`}
        testID={testID}
        source={{ uri }}
        resizeMode={resizeMode}
        accessibilityLabel={accessibilityLabel}
        accessibilityIgnoresInvertColors
        onLoad={() => setState('ready')}
        onError={() => setState('failed')}
        style={{ width: '100%', height: '100%' }}
      />
      {state === 'loading' ? (
        <View
          // A testID, so "is the placeholder up" is observable rather than
          // inferred. The first version of `photo-states.test.tsx` was named
          // "shows a placeholder until the image loads" and asserted only that
          // the IMAGE existed — a test reading its own prose, which is a shape
          // this repository has recorded more than once.
          testID={testID ? `${testID}-loading` : undefined}
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <Skeleton style={{ width: '100%', height: '100%', borderRadius: 0 }} />
        </View>
      ) : null}
    </View>
  );
}

const CENTRE: ViewStyle = {
  alignItems: 'center',
  justifyContent: 'center',
  gap: space.xs,
  padding: space.sm,
};
