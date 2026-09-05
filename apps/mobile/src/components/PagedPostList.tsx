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
      state.items.length === 0 && page.items.length === 0
        ? (page.page.emptyStateHint ?? null)
        : null,
  };
}

export function shouldLoadMore<T>(state: PagedState<T>): boolean {
  return !state.loading && !state.exhausted;
}

export function PagedPostList() {
  return null;
}
