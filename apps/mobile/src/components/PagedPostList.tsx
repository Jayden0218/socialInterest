import { useCallback, useRef } from 'react';
import { FlatList, Text, View } from 'react-native';
import { activePalette as palette, space, type } from '../ui/theme';
import { EmptyState } from '../ui/primitives';
import { Skeleton } from './Skeleton';

export interface Page<T> {
  items: T[];
  page: { nextCursor: string | null; emptyStateHint?: string | null };
}

/**
 * FR-035: scrolling to the end loads older posts WITHOUT losing position.
 *
 * Appends by opaque cursor rather than by offset. An offset shifts whenever a
 * post is published mid-scroll, which is exactly the position loss the
 * requirement forbids.
 */
export interface PagedState<T> {
  items: T[];
  cursor: string | null;
  loading: boolean;
  exhausted: boolean;
  emptyStateHint: string | null;
}

export const initialPagedState = <T,>(): PagedState<T> => ({
  items: [],
  cursor: null,
  loading: false,
  exhausted: false,
  emptyStateHint: null,
});

export function appendPage<T>(state: PagedState<T>, page: Page<T>): PagedState<T> {
  return {
    items: [...state.items, ...page.items],
    cursor: page.page.nextCursor,
    loading: false,
    exhausted: page.page.nextCursor === null,
    emptyStateHint:
      state.items.length === 0 && page.items.length === 0 ? (page.page.emptyStateHint ?? null) : null,
  };
}

/** Stable, because RN refuses a viewabilityConfig that changes identity. */
const VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 60,
  minimumViewTime: 300,
} as const;

export function shouldLoadMore<T>(state: PagedState<T>): boolean {
  return !state.loading && !state.exhausted;
}

export interface PagedPostListProps<T> {
  state: PagedState<T>;
  keyOf: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactElement;
  onLoadMore: () => void;
  empty?: { title: string; body: string; actionLabel?: string; onAction?: () => void };
  /**
   * 007/FR-004. The ids currently meeting the viewability rule, as the list
   * sees it. Optional, because most lists are not the feed and must not report
   * dwell: a saved-posts list scrolling past a post is not attention to it.
   */
  onViewableChanged?: (keys: string[]) => void;
  /**
   * 007/T051. A profile's posts are a GRID in `Profile.dc.html` - three columns
   * of square tiles, 2pt apart - while a feed and a saved list are a waterfall
   * of cards. Same paging, same viewability, different shape, so it is a prop
   * rather than a second component.
   */
  columns?: number;
  /** The gutter between items. A grid's is 2; a card list's is `space.md`. */
  gap?: number;
}

export function PagedPostList<T>({ state, keyOf, renderItem, onLoadMore, empty, onViewableChanged, columns, gap }: PagedPostListProps<T>) {
  /**
   * A STABLE CALLBACK, held through a ref, and it is not a micro-optimisation.
   *
   * `FlatList` THROWS on a changed `onViewableItemsChanged`: "Changing
   * onViewableItemsChanged on the fly is not supported". An inline arrow is a
   * new identity every render, so the feed crashed on its second render — the
   * whole screen, not just the callback.
   *
   * That is exactly the trap `viewabilityConfig` carries and I only guarded the
   * config. Found by a browser journey printing the page error, in seconds;
   * nothing in the unit tests renders a real FlatList, so all 162 stayed green
   * while the app was broken on every surface that shows the feed.
   */
  const latest = useRef(onViewableChanged);
  latest.current = onViewableChanged;
  const handleViewable = useCallback(
    ({ viewableItems }: { viewableItems: { key: string }[] }) =>
      latest.current?.(viewableItems.map((v) => v.key)),
    [],
  );

  if (state.items.length === 0 && !state.loading) {
    return (
      <EmptyState
        testID="paged-empty"
        title={empty?.title ?? 'Nothing here yet'}
        body={empty?.body ?? 'There is nothing to show.'}
        {...(empty?.actionLabel ? { actionLabel: empty.actionLabel } : {})}
        {...(empty?.onAction ? { onAction: empty.onAction } : {})}
      />
    );
  }

  /**
   * THE LAST ROW IS PADDED, and run 47's device capture is why.
   *
   * With `numColumns` and a tile that is `flex: 1`, a trailing row holding ONE
   * item gives that item the whole row: the profile grid rendered two neat rows
   * of three and then a single tile stretched edge to edge. It happens whenever
   * the count is not a multiple of the column count - two thirds of the time at
   * three columns - so it is the normal case, not an edge one.
   *
   * Padded with SPACERS rather than by sizing tiles as a percentage: percentages
   * plus a gap overflow the row (3 x 33.33% + 4pt of gutters is wider than the
   * screen) and wrap, which trades a stretched tile for a broken grid. The
   * spacers are internal to this component, so `keyOf` and `renderItem` still
   * only ever see real items.
   */
  type Row = { spacer: true; id: string } | { spacer: false; item: T };
  const rows: Row[] = state.items.map((item) => ({ spacer: false as const, item }));
  if (columns && columns > 1) {
    const remainder = rows.length % columns;
    if (remainder !== 0) {
      for (let i = remainder; i < columns; i++) {
        rows.push({ spacer: true as const, id: `spacer-${i}` });
      }
    }
  }

  return (
    <FlatList
      testID="paged-post-list"
      data={rows}
      // A REAL ITEM KEEPS ITS OWN KEY, untouched. `handleViewable` below maps
      // these keys straight to post ids for FR-004's dwell signal, so decorating
      // them - with an index, say - would record attention against
      // "<postId>:0" and quietly stop matching anything.
      keyExtractor={(row) => (row.spacer ? row.id : keyOf(row.item))}
      renderItem={({ item: row, index }) =>
        row.spacer ? <View style={{ flex: 1 }} /> : renderItem(row.item, index)
      }
      // Cursor paging: appending never reorders what is already on screen.
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (shouldLoadMore(state)) onLoadMore();
      }}
      // `numColumns` may not CHANGE on the fly - React Native throws, the same
      // rule as `onViewableItemsChanged` two lines down. It is a prop of the
      // screen, fixed for the life of the list, so that is safe here.
      {...(columns && columns > 1
        ? { numColumns: columns, columnWrapperStyle: { gap: gap ?? space.md } }
        : {})}
      contentContainerStyle={{ gap: gap ?? space.md }}
      {...(onViewableChanged
        ? {
            /**
             * Research R7: 60% visible for 300ms. Both halves matter - area
             * alone counts a post the reader flicked past, and time alone
             * counts one barely on screen.
             *
             * BOTH the config and the CALLBACK must be stable across renders;
             * React Native throws "Changing ... on the fly is not supported"
             * for either. The config is a module constant and the handler is
             * held through a ref above — guarding only the config, which is
             * what I did first, crashes the feed on its second render.
             */
            viewabilityConfig: VIEWABILITY_CONFIG,
            onViewableItemsChanged: handleViewable,
          }
        : {})}
      ListFooterComponent={
        state.loading ? (
          /**
           * 006/FR-023. A SKELETON IN THE SHAPE OF WHAT IS COMING, not a spinner.
           *
           * A spinner says something is happening and nothing about what. Two
           * card-shaped placeholders say "two more posts are arriving" and hold
           * roughly the space they will need, so the scroll position does not
           * lurch when they land.
           *
           * `paged-loading` keeps its testID and its meaning - the contract in
           * contracts/testid-preservation.md is about the id AND what it marks.
           */
          <View testID="paged-loading" style={{ gap: space.md, paddingVertical: space.md }}>
            <Skeleton style={{ height: 220 }} />
            <Skeleton style={{ height: 220 }} />
          </View>
        ) : state.exhausted && state.items.length > 0 ? (
          <Text testID="paged-end" style={{ textAlign: 'center', color: palette.text.muted, fontSize: type.caption.size }}>
            You're all caught up
          </Text>
        ) : null
      }
    />
  );
}
