import { Text } from 'react-native';
import type { Post } from '@sih/shared';
import { activePalette as palette, textStyle } from '../../ui/theme';
import { Screen } from '../../ui/primitives';
import { PagedPostList, type PagedState } from '../../components/PagedPostList';

export type FeedEmptyState = 'no_posts_yet' | null;

/**
 * 001/FR-036 SURVIVES; ONE OF ITS TWO STATES DOES NOT.
 *
 * There used to be two, and keeping them apart was the point: "you follow
 * nothing" was an onboarding problem and "your interests have no posts" was a
 * content problem, and showing the wrong one sent people to a dead end.
 *
 * `no_followed_interests` is GONE with the composed feed (007/RS-008). A ranked
 * feed is never in that state: it draws candidates across the catalogue and
 * explores outside whatever the person has declared, so "you follow nothing" is
 * no longer a reason for an empty screen — and a new account that skips the
 * cold-start picks must still see posts (007/FR-015).
 *
 * The remaining state is the honest one: the catalogue itself is empty.
 */
export interface EmptyStateCopy {
  title: string;
  body: string;
  action: 'choose_interests' | 'create_post';
  actionLabel: string;
}

export function emptyStateCopy(hint: FeedEmptyState): EmptyStateCopy | null {
  switch (hint) {
    case 'no_posts_yet':
      return {
        title: 'Nothing here yet',
        body: 'There is nothing to show yet. Be the first.',
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
  onViewableChanged,
  renderPost,
}: {
  state: PagedState<Post>;
  onLoadMore: () => void;
  onEmptyAction: (action: EmptyStateCopy['action']) => void;
  /** 007/FR-004. Absent in tests that render this screen directly. */
  onViewableChanged?: (postIds: string[]) => void;
  renderPost: (post: Post, index: number) => React.ReactElement;
}) {
  const copy = emptyStateCopy(state.emptyStateHint as FeedEmptyState);

  return (
    <Screen testID="home-feed-screen">
      <Text style={{ ...textStyle.display, fontWeight: '700', color: palette.text.primary }}>Your feed</Text>
      <PagedPostList
        state={state}
        keyOf={(p) => p.postId}
        renderItem={renderPost}
        onLoadMore={onLoadMore}
        {...(onViewableChanged ? { onViewableChanged } : {})}
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
