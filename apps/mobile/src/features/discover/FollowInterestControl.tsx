import type { Interest } from '@sih/shared';

/** Mirrors MAX_FOLLOWED_INTERESTS on the server (research D1). */
export const MAX_FOLLOWED_INTERESTS = 200;

/** SC-006: three relevant interests within two minutes of signing up. */
export const ONBOARDING_TARGET = 3;

export type FollowState = 'following' | 'not_following' | 'pending' | 'at_limit';

export function followState(interest: Interest, followedCount: number): FollowState {
  if (interest.viewerIsFollowing) return 'following';
  return followedCount >= MAX_FOLLOWED_INTERESTS ? 'at_limit' : 'not_following';
}

export function limitMessage(followedCount: number): string | null {
  if (followedCount < MAX_FOLLOWED_INTERESTS) return null;
  return `You follow ${MAX_FOLLOWED_INTERESTS} interests, the maximum. Unfollow one to make room.`;
}

/** Onboarding is complete once enough interests are chosen to fill a feed. */
export function onboardingComplete(followedCount: number): boolean {
  return followedCount >= ONBOARDING_TARGET;
}

export function FollowInterestControl() {
  return null;
}
