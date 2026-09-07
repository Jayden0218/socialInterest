import type { Post, Interest, Notification } from '@sih/shared';
import { useData } from '../data-provider';
import { usePaged, type PagedResult } from './usePaged';

/** Home feed - composed from FOLLOWED INTERESTS only (Principle I, FR-033). */
export function useHomeFeed(): PagedResult<Post> {
  const data = useData();
  return usePaged<Post>((cursor) => data.feed.home(cursor ? { cursor } : {}), []);
}

export function useInterestSearch(query: string): PagedResult<Interest> {
  const data = useData();
  return usePaged<Interest>(
    () => (query.trim() === '' ? data.interests.listTop({ limit: 20 }) : data.interests.search(query)),
    [query],
  );
}

/**
 * 004/FR-027 to FR-029.
 *
 * `order` and `q` are in the dependency list, so changing either RESTARTS the
 * paging rather than appending a differently-ordered page onto the one already
 * on screen - which would produce a list that is neither ordering.
 */
export function useInterestPosts(
  interestId: string,
  opts: { order?: 'new' | 'top'; q?: string } = {},
): PagedResult<Post> {
  const data = useData();
  const order = opts.order ?? 'new';
  const q = opts.q ?? '';
  return usePaged<Post>(
    (cursor) =>
      data.interests.posts(interestId, {
        ...(cursor ? { cursor } : {}),
        order,
        ...(q.trim() ? { q } : {}),
      }),
    [interestId, order, q],
  );
}

export function useNotifications(): PagedResult<Notification> {
  const data = useData();
  return usePaged<Notification>((cursor) => data.notifications.list(cursor ? { cursor } : {}), []);
}

/**
 * A person's posts, by handle.
 *
 * An EMPTY handle means "not known yet" and fetches nothing. The self profile
 * tab renders before `GET /v1/me` has resolved, and it used to pass the literal
 * string "me" straight through as a handle - so the server was asked for a
 * person called "me", answered 404, and your own posts never appeared on your
 * own profile. Silently: the list simply stayed empty.
 *
 * Found by the device journeys, where the API log showed three
 * `GET /v1/people/:handle/posts 404` against exactly the three failing flows.
 */
export function useProfilePosts(handle: string): PagedResult<Post> {
  const data = useData();
  return usePaged<Post>(
    (cursor) =>
      handle === ''
        ? Promise.resolve({ items: [], nextCursor: undefined })
        : data.posts.byHandle(handle, cursor ? { cursor } : {}),
    [handle],
  );
}

export { usePaged };
export type { PagedResult };
