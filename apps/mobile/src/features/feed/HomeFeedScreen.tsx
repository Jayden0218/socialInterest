import { Text } from 'react-native';
import type { Post } from '@sih/shared';
import { activePalette as palette, type } from '../../ui/theme';
import { Screen } from '../../ui/primitives';
import { PagedPostList, type PagedState } from '../../components/PagedPostList';

export type FeedEmptyState = 'no_followed_interests' | 'no_posts_yet' | null;

/**
 * FR-036: the two empty states are NOT the same and must not share a screen.
 *
 * "You follow nothing" is an onboarding problem — the answer is a list of
 * interests to pick from, and SC-006 measures whether someone can choose three
 * within two minutes. "Your interests have no posts yet" is a content problem —
 * the answer is an invitation to post. Showing the wrong one sends people to a
 * dead end.
 */
export interface EmptyStateCopy {
  title: string;
  body: string;
  action: 'choose_interests' | 'create_post';
  actionLabel: string;
}

export function emptyStateCopy(hint: FeedEmptyState): EmptyStateCopy | null {
  switch (hint) {
    case 'no_followed_interests':
      return {
        title: 'Pick a few interests',
        body: 'Your feed is built from the interests you follow.',
        action: 'choose_interests',
        actionLabel: 'Browse interests',
      };
    case 'no_posts_yet':
      return {
        title: 'Nothing here yet',
        body: 'The interests you follow have no posts. Be the first.',
        action: 'create_post',
        actionLabel: 'Create a post',
      };
    default:
      return null;
  }
}

export function HomeFeedScreen({
  state,
  onLoadMore,
  onEmptyAction,
  renderPost,
}: {
  state: PagedState<Post>;
  onLoadMore: () => void;
  onEmptyAction: (action: EmptyStateCopy['action']) => void;
  renderPost: (post: Post, index: number) => React.ReactElement;
}) {
  const copy = emptyStateCopy(state.emptyStateHint as FeedEmptyState);

  return (
    <Screen testID="home-feed-screen">
      <Text style={{ fontSize: type.display.size,
 lineHeight: type.display.lineHeight, fontWeight: '700', color: palette.text.primary }}>Your feed</Text>
      <PagedPostList
        state={state}
        keyOf={(p) => p.postId}
        renderItem={renderPost}
        onLoadMore={onLoadMore}
        {...(copy
          ? {
              empty: {
                title: copy.title,
                body: copy.body,
                actionLabel: copy.actionLabel,
                onAction: () => onEmptyAction(copy.action),
              },
            }
          : {})}
      />
    </Screen>
  );
}
