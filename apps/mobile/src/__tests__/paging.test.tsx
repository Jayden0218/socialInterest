import { act, renderHook } from '@testing-library/react-native';
import { usePaged } from '../containers/usePaged';

/**
 * THE APP COULD NOT LOAD A SECOND PAGE OF ANYTHING, and it never could.
 *
 * `ApiPage<T>` declared `nextCursor` at the TOP LEVEL. Every list endpoint
 * answers `{ items, page: { nextCursor, emptyStateHint } }`, so this hook read
 * `undefined`, `appendPage` marked the list exhausted, and infinite scroll
 * stopped after the first page — on the feed, interest spaces, profiles,
 * comments and notifications alike. `emptyStateHint` never arrived either, so
 * no empty-state copy has ever rendered from a real response.
 *
 * Nothing caught it for five features. Every mobile test stubs the data layer,
 * and the stubs were wrong in exactly the same way the type was: they agreed
 * with each other, and neither agreed with the server. Every screen looked
 * correct because page one always arrives.
 *
 * These tests are written against the SERVER'S shape, taken from the
 * controllers, not from the type that was wrong.
 */
describe('usePaged reads the cursor the server actually sends', () => {
  const item = (id: string) => ({ id });

  it('follows the NESTED cursor and loads a second page', async () => {
    const pages = [
      { items: [item('a')], page: { nextCursor: 'CUR1', emptyStateHint: null } },
      { items: [item('b')], page: { nextCursor: null, emptyStateHint: null } },
    ];
    const fetchPage = jest.fn(async (cursor?: string) => (cursor ? pages[1]! : pages[0]!));

    const { result } = renderHook(() => usePaged<{ id: string }>(fetchPage, []));
    await act(async () => undefined);

    expect(result.current.state.items).toHaveLength(1);
    expect(result.current.state.exhausted).toBe(false);

    await act(async () => {
      result.current.loadMore();
    });

    expect(fetchPage).toHaveBeenLastCalledWith('CUR1');
    expect(result.current.state.items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(result.current.state.exhausted).toBe(true);
  });

  it('carries the nested emptyStateHint through to the screen', async () => {
    const fetchPage = jest.fn(async () => ({
      items: [] as { id: string }[],
      page: { nextCursor: null, emptyStateHint: 'no_posts_yet' },
    }));

    const { result } = renderHook(() => usePaged<{ id: string }>(fetchPage, []));
    await act(async () => undefined);

    // Without this the screens render their generic fallback and every
    // carefully-distinguished empty state is dead code.
    expect(result.current.state.emptyStateHint).toBe('no_posts_yet');
  });

  it('still handles the one endpoint that is genuinely flat', async () => {
    // Conversation messages long-poll and answer `nextCursor` at the top level.
    // Supporting both is not tolerance for a mistake — it is two real shapes,
    // and pretending otherwise would break chat to tidy a type.
    const pages = [
      { items: [item('m1')], nextCursor: 'M1' },
      { items: [item('m2')], nextCursor: undefined },
    ];
    const fetchPage = jest.fn(async (cursor?: string) => (cursor ? pages[1]! : pages[0]!));

    const { result } = renderHook(() => usePaged<{ id: string }>(fetchPage, []));
    await act(async () => undefined);
    await act(async () => {
      result.current.loadMore();
    });

    expect(fetchPage).toHaveBeenLastCalledWith('M1');
    expect(result.current.state.items.map((i) => i.id)).toEqual(['m1', 'm2']);
  });
});
