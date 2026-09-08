import { useCallback, useEffect, useState } from 'react';
import { appendPage, initialPagedState, type PagedState } from '../components/PagedPostList';
import { DataError } from '../data';

/**
 * What the data layer returns for a list call — THE SERVER'S ACTUAL SHAPE.
 *
 * This said `nextCursor?: string` at the top level until 007. Every list
 * endpoint nests it under `page`, so this read `undefined` on every call,
 * `appendPage` recorded the list as exhausted, and THE APP COULD NEVER LOAD A
 * SECOND PAGE of anything. Page one always arrived, so every screen looked
 * right; infinite scroll simply stopped after twenty items.
 *
 * `nextCursor` is kept as an optional fallback for the one endpoint that is
 * genuinely flat (conversation messages, which long-poll rather than page), so
 * this generic can serve both without either lying about the other.
 */
export interface ApiPage<T> {
  items: T[];
  page?: { nextCursor: string | null; emptyStateHint?: string | null };
  /** The flat form. Only conversation messages answer this way. */
  nextCursor?: string;
}

export interface PagedResult<T> {
  state: PagedState<T>;
  error: string | null;
  reload: () => void;
  loadMore: () => void;
}

/**
 * Cursor paging over a data-layer list call, producing the exact PagedState the
 * screens already render (FR-035: append by opaque cursor, never by offset).
 *
 * One implementation, so a screen cannot invent its own and get the
 * empty-versus-error distinction subtly wrong - rendering "nothing here yet" for
 * a failed request is the mistake this prevents.
 */
export function usePaged<T>(
  fetchPage: (cursor?: string) => Promise<ApiPage<T>>,
  deps: unknown[] = [],
): PagedResult<T> {
  const [state, setState] = useState<PagedState<T>>(initialPagedState<T>());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
      setState((s) => ({ ...s, loading: true }));
      setError(null);
      try {
        const page = await fetchPage(cursor);
        const asPage = {
          items: page.items,
          page: {
            nextCursor: page.page?.nextCursor ?? page.nextCursor ?? null,
            emptyStateHint: page.page?.emptyStateHint ?? null,
          },
        };
        setState((s) => appendPage(cursor ? s : initialPagedState<T>(), asPage));
      } catch (err) {
        setState((s) => ({ ...s, loading: false }));
        setError(err instanceof DataError ? err.message : String(err));
      }
    },
    // The caller owns the dependency list: which values should refetch is a
    // per-hook decision, not something this generic can infer.
    deps,
  );

  useEffect(() => {
    void load();
  }, deps);

  const loadMore = useCallback(() => {
    if (state.loading || state.exhausted || state.cursor === null) return;
    void load(state.cursor);
  }, [state.loading, state.exhausted, state.cursor, load]);

  return { state, error, reload: () => void load(), loadMore };
}
