import type { InterestRef } from '@sih/shared';

export interface ProfileData {
  handle: string;
  displayName: string;
  bio: string | null;
  followerCount: number;
  followingCount: number;
  topInterests: InterestRef[];
  viewerIsFollowing: boolean;
}

/**
 * FR-038. The follow button says what following actually does, because in this
 * product it does something narrower than people expect: it gives this person's
 * posts prominence inside interests the viewer already follows (FR-033), and it
 * grants access to their followers-only posts (FR-015). It does NOT add their
 * other interests to the feed.
 */
export function followHint(profile: ProfileData, viewerFollowsAnyOfTheirInterests: boolean): string {
  if (profile.viewerIsFollowing) {
    return viewerFollowsAnyOfTheirInterests
      ? 'Their posts appear higher in the interests you follow.'
      : 'Follow one of their interests to see their posts in your feed.';
  }
  return 'Following shows their posts higher in interests you already follow.';
}

export function ProfileScreen() {
  return null;
}
