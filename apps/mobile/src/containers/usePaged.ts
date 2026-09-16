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

/**
 * WHICH OF THE FOUR A SURFACE IS IN — 012/FR-001.
 *
 * Exactly one at a time, and each one visually distinct from the others.
 */
export type SurfaceState = 'loading' | 'empty' | 'failed' | 'content';

export interface PagedResult<T> {
  state: PagedState<T>;
  error: string | null;
  reload: () => void;
  loadMore: () => void;
  /**
   * 012/T017. DERIVED ONCE, HERE, rather than by each screen.
   *
   * Twenty-five screens each deciding what "empty" means is twenty-five chances
   * to render a blank rectangle, and the handful that had an opinion before this
   * feature already disagreed with each other. It is D6's argument about
   * `VisibilityFilter` applied to a presentational fact: one decision, made in
   * one place, that every read path goes through.
   */
  surface: SurfaceState;
  /** 012/FR-012. A pull-to-refresh is in flight. */
  refreshing: boolean;
  /** 012/FR-012 to FR-014. Re-reads from the top. Never stacks. */
  refresh: () => void;
}

/**
 * 012/FR-005. No loading indicator for a request that resolves faster than this.
 *
 * A skeleton that appears and vanishes inside 40ms is a flash of grey that
 * reads as a glitch rather than as progress — worse than showing nothing. The
 * threshold is conventional rather than measured, and it lives HERE, in one
 * place, so that somebody who disagrees has one number to change.
 */
export const LOADING_VISIBLE_AFTER_MS = 200;

/**
 * 012/FR-006. A request pending past this is reported FAILED, not loading.
 *
 * Without an upper bound a dropped connection shows a skeleton for ever, and a
 * loading state that never resolves is a blank screen wearing a costume — the
 * same defect this feature exists to remove, arriving by a slower route.
 */
export const REQUEST_TIMEOUT_MS = 15_000;

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
  const [refreshing, setRefreshing] = useState(false);
  /**
   * "In flight for long enough that a person should be told" — FR-005.
   *
   * A separate piece of state rather than a comparison against a start time,
   * because a timestamp does not re-render: the screen would sit blank until
   * something else happened to update it, which is the defect rather than the
   * fix.
   */
  const [slowEnoughToShow, setSlowEnoughToShow] = useState(false);

  /**
   * FR-005 and FR-006, the two ends of the same clock.
   *
   * Both timers are cleared when the request settles, so neither can fire
   * against a later one. `state.loading` going false is the settle signal.
   */
  useEffect(() => {
    if (!state.loading) {
      setSlowEnoughToShow(false);
      return;
    }
    const show = setTimeout(() => setSlowEnoughToShow(true), LOADING_VISIBLE_AFTER_MS);
    const giveUp = setTimeout(() => {
      // FR-006. Reported as failed, and retryable — not left spinning.
      setState((s) => ({ ...s, loading: false }));
      setError('This is taking longer than it should. Check your connection.');
    }, REQUEST_TIMEOUT_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(giveUp);
    };
  }, [state.loading]);

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

  /**
   * 012/FR-012 to FR-014. Pull to refresh.
   *
   * THE GUARD IS THE REQUIREMENT, not a nicety: FR-014 says a refresh asked for
   * while one is running must not start a second. Without it, three pulls are
   * three in-flight reads racing to call `setState`, and the list shows
   * whichever answers last.
   *
   * `refreshing` is separate from `state.loading` because they mean different
   * things to a person: loading is "I have nothing yet", refreshing is "I have
   * this, and I am checking". Conflating them makes a pull blank the screen.
   */
  const refresh = useCallback(() => {
    if (refreshing) return;
    setRefreshing(true);
    void Promise.resolve(load()).finally(() => setRefreshing(false));
  }, [refreshing, load]);

  /**
   * 012/FR-001. THE FOUR STATES, DECIDED HERE AND NOWHERE ELSE.
   *
   * Order matters and is not arbitrary:
   *
   * - Anything already fetched is CONTENT, even mid-refresh. Replacing a list a
   *   person is reading with a skeleton because a background read started is
   *   the refresh blanking the screen.
   * - A failure outranks emptiness. Showing "nothing here yet" for a dropped
   *   connection is a lie that makes somebody stop looking, and it is precisely
   *   what `InboxContainer`'s error branch already existed to prevent.
   * - LOADING IS NOT `state.loading`. It is "in flight AND long enough to be
   *   worth saying so" (FR-005), which is why a fast request goes straight from
   *   nothing to content with no flash of grey in between.
   */
  const surface: SurfaceState =
    state.items.length > 0 ? 'content'
    : error !== null ? 'failed'
    : slowEnoughToShow ? 'loading'
    : state.loading ? 'content'
    : 'empty';

  return { state, error, reload: () => void load(), loadMore, surface, refreshing, refresh };
}
