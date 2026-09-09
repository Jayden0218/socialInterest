import { useEffect, useRef } from 'react';
import type { Post, Interest, Notification } from '@sih/shared';
import { useData } from '../data-provider';
import { usePaged, type PagedResult } from './usePaged';
import type { PostSearchPage } from '../data/search';

/** Home feed - RANKED from behaviour (007). 001/FR-033's composed feed is withdrawn. */
export function useHomeFeed(): PagedResult<Post> {
  const data = useData();
  return usePaged<Post>((cursor) => data.feed.home(cursor ? { cursor } : {}), []);
}

/**
 * 008/FR-008. The Following feed - chronological, unranked.
 *
 * A separate hook rather than a parameter on `useHomeFeed`, so switching tabs
 * cannot carry one surface's cursor into the other: the ranked feed's cursor is
 * an opaque token holding what this session has been shown, and Following's is a
 * timestamp. Feeding either to the other would repeat posts or skip them.
 */
export function useFollowingFeed(): PagedResult<Post> {
  const data = useData();
  return usePaged<Post>((cursor) => data.feed.following(cursor ? { cursor } : {}), []);
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

/**
 * 008/US6 — post text search.
 *
 * `enabled` rather than a separate call site: `usePaged` fires on mount, and a
 * search for the empty string is a request the server would have to refuse. The
 * meta and fallback the response carries are handed back through `onPage`,
 * because `usePaged` deliberately keeps only the items - and FR-022's fallback
 * is not an item.
 */
export function usePostSearch(
  query: string,
  enabled: boolean,
  onPage: (page: PostSearchPage) => void,
): PagedResult<Post> {
  const data = useData();
  const latest = useRef(onPage);
  latest.current = onPage;
  return usePaged<Post>(
    async (cursor) => {
      if (!enabled || query.trim() === '') return { items: [], page: { nextCursor: null } };
      const page = await data.search.posts(query, cursor ? { cursor } : {});
      latest.current(page);
      return page;
    },
    [query, enabled],
  );
}

export function useNotifications(): PagedResult<Notification> {
  const data = useData();
  return usePaged<Notification>((cursor) => data.notifications.list(cursor ? { cursor } : {}), []);
}

/**
 * 008/FR-005 — MARKS THE NOTIFICATIONS READ WHEN THE SURFACE IS VIEWED.
 *
 * Separate from `useNotifications` on purpose. Marking read is a WRITE, and
 * folding it into the paging hook would fire it again on every page - so the
 * watermark would advance while a person scrolled through notifications they had
 * not looked at yet.
 *
 * Fired ONCE per mount, after the first page has arrived. Before it arrives
 * there is nothing to have been seen, and marking read on an empty screen would
 * clear a badge for notifications the person never saw.
 *
 * Failure is swallowed on purpose: this is a courtesy write, and an error banner
 * over somebody's notifications because a badge did not clear is worse than the
 * badge not clearing.
 */
export function useMarkNotificationsRead(ready: boolean): void {
  const data = useData();
  const done = useRef(false);
  useEffect(() => {
    if (!ready || done.current) return;
    done.current = true;
    void data.notifications.markAllRead().catch(() => undefined);
  }, [data, ready]);
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
