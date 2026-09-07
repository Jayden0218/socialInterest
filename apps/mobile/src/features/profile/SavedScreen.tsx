import type { Post } from '@sih/shared';
import { Screen } from '../../ui/primitives';
import { PagedPostList, type PagedState } from '../../components/PagedPostList';

/**
 * FR-038, FR-039. Your saved posts, and nobody else's.
 *
 * The empty state says "nothing saved yet" rather than "nothing to show",
 * because a saved list is empty for a reason the person controls - unlike a
 * feed, which is empty because of what other people have or have not done.
 */
export function SavedScreen({
  posts,
  onLoadMore,
  renderPost,
}: {
  posts: PagedState<Post>;
  onLoadMore: () => void;
  renderPost: (post: Post) => React.ReactElement;
}) {
  return (
    <Screen testID="saved-screen">
      <PagedPostList
        state={posts}
        keyOf={(p: Post) => p.postId}
        renderItem={renderPost}
        onLoadMore={onLoadMore}
        empty={{
          title: 'Nothing saved yet',
          body: 'Tap the star on a post to keep it here.',
        }}
      />
    </Screen>
  );
}
