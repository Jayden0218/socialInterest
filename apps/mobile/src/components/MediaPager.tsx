import { useState } from 'react';
import { Image, type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, Text, View } from 'react-native';
import type { MediaItem, Post } from '@sih/shared';
import { mediaLabel } from './mediaLabel';
import { activePalette as palette, radius, space, textStyle } from '../ui/theme';

/**
 * 008/US1 — THE WHOLE POST, ON THE DETAIL SURFACE.
 *
 * The publish screen has always promised "Up to 10 photos". The API has always
 * returned all of them — `PostQueryService.toResponse` maps every media row,
 * presigned, and `keys.mediaItem` sorts on a zero-padded `MEDIA#000`, so
 * publication order is structural and needs no field. And every render path in
 * this app read `post.media[0]`.
 *
 * So nine of ten photographs were invisible **to everyone including the author,
 * permanently**. 190 green mobile tests said nothing, because every post fixture
 * in the suite carried exactly one media item — a multi-item assertion against a
 * single-item fixture passes and means nothing.
 *
 * A SCROLLVIEW, NOT A FLATLIST, and the reason is not laziness. The set is
 * bounded at ten by `media.limits.ts`, so there is nothing to virtualise; and a
 * `FlatList` here would want `onViewableItemsChanged` to track the page, which
 * throws on a changed callback identity — the defect that crashed 007's feed on
 * its SECOND render and produced fifteen browser timeouts with no reason given.
 * Ten children cost less than that class of bug.
 *
 * HORIZONTAL, inside a vertically-scrolling screen. Different axes, so this is
 * not the nested-scrollable trap 007/R6 recorded for the waterfall — that one is
 * about two lists on the SAME axis, which disables windowing.
 */
export function MediaPager({ post }: { post: Post }) {
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);

  /**
   * FR-004 — A FAILED ITEM IS ACCOUNTED FOR, AND ONLY TO ITS AUTHOR.
   *
   * BOTH HALVES ARE ALREADY TRUE HERE, AND THE SECOND IS NOT THIS COMPONENT'S
   * TO ENFORCE. This started life with a `viewerIsAuthor` prop filtering failed
   * items out for everyone else. That was a client-side visibility decision —
   * the exact thing this codebase keeps behind one boundary — and it was also
   * redundant:
   *
   *   `ProcessingService.reconcile`: if ANY media item is `failed`, the POST is
   *   `failed`. `VisibilityFilter.decide`: a post whose `processingState` is not
   *   `ready` is visible to its author and to nobody else.
   *
   * So anyone holding a post with a failed item IS its author. Re-deciding that
   * here would be a second predicate that agrees with the boundary today and is
   * one refactor from disagreeing — Principle II's whole rationale.
   *
   * The slot is therefore always rendered. The author is the one person who
   * needs to know why part of their post never appeared, which is the state 002
   * found the whole product silently stuck in.
   */
  const items = post.media ?? [];
  if (items.length === 0) return null;

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    if (width <= 0) return;
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    /**
     * `flex: 1`, AND THE MEASUREMENT IS ON THIS VIEW, not on the ScrollView.
     *
     * Both halves were wrong in run 48 and the failure was invisible to nine
     * green component tests: React Native Testing Library renders the tree and
     * performs NO LAYOUT, so a component that mounts correctly and collapses to
     * zero height passes every assertion in `media-pager.test.tsx`.
     *
     * The device said `Assertion is false: id: media-pager is visible`, and
     * `browser/media-pager-fit.spec.ts` reproduced it in one run with the reason
     * attached: `locator resolved to HIDDEN <div data-testid="media-pager">`.
     * The element mounted and had no size, because this wrapper had no `flex`
     * inside `post-media`'s `aspectRatio: 1` frame.
     *
     * Measuring HERE rather than on the ScrollView also means the page width is
     * the frame's width rather than the scroller's own, which is the number a
     * paging scroll actually needs.
     */
    <View
      testID="media-pager-frame"
      style={{ flex: 1 }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <ScrollView
        testID="media-pager"
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={{ flex: 1, borderRadius: radius.md, overflow: 'hidden' }}
      >
        {/*
          Rendered only once the frame has been measured. A page with no width
          inside a horizontal scroller is zero points wide, which is the same
          invisible-but-present failure one level down.
        */}
        {(width > 0 ? items : []).map((item, i) => (
          <View
            key={i}
            testID={`media-page-${i}`}
            style={{
              width,
              height: '100%',
              backgroundColor: palette.bg.raised,
            }}
          >
            {i === 0 ? (
              /*
                006/FR-027 — A COMPATIBILITY ANCHOR, AND THE LITERAL STAYS HERE.
                `.maestro/19-publish-video.yaml` selects `video-poster` and the
                browser journeys select `post-image`. Both keep resolving because
                the first page wraps its image in a View carrying the id.

                The two literals sit in a `testID=` position ON PURPOSE.
                `verify-maestro-ids.mjs` reads the leading literal of a template
                or a ternary in that position and cannot see through a prop or a
                helper call - it refused this exact change when the id was passed
                in as a prop, which is the guard working. 005 lost three attempts
                to the same rule and the lesson was the same: keep the prefix
                where the verifier reads it.
              */
              <View
                testID={item.kind === 'video' && item.processingState === 'ready' ? 'video-poster' : 'post-image'}
                style={{ flex: 1 }}
              >
                <MediaFrame item={item} index={i} label={mediaLabel(post, item)} />
              </View>
            ) : (
              <MediaFrame item={item} index={i} label={mediaLabel(post, item)} />
            )}
          </View>
        ))}
      </ScrollView>

      {/*
        FR-002 — POSITION, and only within a set of MORE THAN ONE.

        `items.length`, not `post.media.length`: the count a viewer sees is the
        count of what they can see. Counting hidden items here is the disclosure
        the filter above exists to avoid.
      */}
      {items.length > 1 ? (
        <View
          style={{
            position: 'absolute',
            right: space.sm,
            top: space.sm,
            paddingVertical: space.xs,
            paddingHorizontal: space.sm,
            borderRadius: radius.pill,
            backgroundColor: palette.bg.raised,
          }}
        >
          <Text
            testID="media-position"
            // Announced as a whole rather than as three fragments, so a screen
            // reader says "2 of 5" and not "2", "/", "5".
            accessibilityLabel={`Image ${index + 1} of ${items.length}`}
            style={{ ...textStyle.small, color: palette.text.primary }}
          >
            {index + 1} / {items.length}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function MediaFrame({
  item,
  index,
  label,
}: {
  item: MediaItem;
  index: number;
  /** 008/FR-035. Already resolved by `mediaLabel` — one order, one wording. */
  label: string;
}): React.ReactElement {
  if (item.processingState === 'failed') {
    return (
      <View
        testID={`media-failed-${index}`}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.md }}
      >
        <Text style={{ ...textStyle.small, color: palette.text.muted, textAlign: 'center' }}>
          This image could not be processed. Only you can see this.
        </Text>
      </View>
    );
  }
  const uri = item.posterUrl ?? Object.values(item.renditions ?? {})[0] ?? '';
  return (
    <Image
      testID={`media-image-${index}`}
      source={{ uri }}
      resizeMode="cover"
      accessibilityLabel={label}
      accessibilityIgnoresInvertColors
      style={{ flex: 1, width: '100%', height: '100%' }}
    />
  );
}
