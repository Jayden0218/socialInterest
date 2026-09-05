import type { Post } from '@sih/shared';

export type FeedEmptyState = 'no_followed_interests' | 'no_posts_yet' | null;

export interface HomeFeedData {
  items: Post[];
  emptyStateHint: FeedEmptyState;
}

/**
 * FR-036: the two empty states are NOT the same and must not share a screen.
 *
 * "You follow nothing" is an onboarding problem - the answer is a list of
 * interests to pick from, and SC-006 measures whether someone can choose three
 * within two minutes. "Your interests have no posts yet" is a content problem -
 * the answer is an invitation to post. Showing the wrong one sends people to a
 * dead end.
 */
export interface EmptyStateCopy {
  title: string;
  body: string;
  action: 'choose_interests' | 'create_post';
}

export function emptyStateCopy(hint: FeedEmptyState): EmptyStateCopy | null {
  switch (hint) {
    case 'no_followed_interests':
      return {
        title: 'Pick a few interests',
        body: 'Your feed is built from the interests you follow.',
        action: 'choose_interests',
      };
    case 'no_posts_yet':
      return {
        title: 'Nothing here yet',
        body: 'The interests you follow have no posts. Be the first.',
        action: 'create_post',
      };
    default:
      return null;
  }
}

export function HomeFeedScreen() {
  return null;
}
