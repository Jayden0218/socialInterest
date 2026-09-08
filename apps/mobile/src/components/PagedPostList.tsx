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
}

export function PagedPostList<T>({ state, keyOf, renderItem, onLoadMore, empty, onViewableChanged }: PagedPostListProps<T>) {
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

  return (
    <FlatList
      testID="paged-post-list"
      data={state.items}
      keyExtractor={keyOf}
      renderItem={({ item, index }) => renderItem(item, index)}
      // Cursor paging: appending never reorders what is already on screen.
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (shouldLoadMore(state)) onLoadMore();
      }}
      contentContainerStyle={{ gap: space.md }}
      {...(onViewableChanged
        ? {
            /**
             * Research R7: 60% visible for 300ms. Both halves matter - area
             * alone counts a post the reader flicked past, and time alone
             * counts one barely on screen.
             *
             * The config object must be STABLE across renders; React Native
             * throws "Changing viewabilityConfig on the fly is not supported"
             * otherwise, which is why it is a module constant.
             */
            viewabilityConfig: VIEWABILITY_CONFIG,
            onViewableItemsChanged: ({ viewableItems }: { viewableItems: { key: string }[] }) =>
              onViewableChanged(viewableItems.map((v) => v.key)),
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
