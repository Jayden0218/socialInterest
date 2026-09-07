import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { theme } from '../ui/theme';
import { EmptyState } from '../ui/primitives';

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

export function shouldLoadMore<T>(state: PagedState<T>): boolean {
  return !state.loading && !state.exhausted;
}

export interface PagedPostListProps<T> {
  state: PagedState<T>;
  keyOf: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactElement;
  onLoadMore: () => void;
  empty?: { title: string; body: string; actionLabel?: string; onAction?: () => void };
}

export function PagedPostList<T>({ state, keyOf, renderItem, onLoadMore, empty }: PagedPostListProps<T>) {
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
      contentContainerStyle={{ gap: theme.space.md }}
      ListFooterComponent={
        state.loading ? (
          <View testID="paged-loading" style={{ padding: theme.space.lg }}>
            <ActivityIndicator />
          </View>
        ) : state.exhausted && state.items.length > 0 ? (
          <Text testID="paged-end" style={{ textAlign: 'center', color: theme.color.muted, fontSize: theme.font.sm }}>
            You're all caught up
          </Text>
        ) : null
      }
    />
  );
}
