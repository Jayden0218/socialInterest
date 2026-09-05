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

export function useInterestPosts(interestId: string): PagedResult<Post> {
  const data = useData();
  return usePaged<Post>((cursor) => data.interests.posts(interestId, cursor ? { cursor } : {}), [interestId]);
}

export function useNotifications(): PagedResult<Notification> {
  const data = useData();
  return usePaged<Notification>((cursor) => data.notifications.list(cursor ? { cursor } : {}), []);
}

export function useProfilePosts(handle: string): PagedResult<Post> {
  const data = useData();
  return usePaged<Post>((cursor) => data.posts.byHandle(handle, cursor ? { cursor } : {}), [handle]);
}

export { usePaged };
export type { PagedResult };
