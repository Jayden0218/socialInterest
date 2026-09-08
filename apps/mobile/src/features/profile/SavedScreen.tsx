import { Text, View } from 'react-native';
import type { Post } from '@sih/shared';
import { activePalette as palette, space, textStyle } from '../../ui/theme';
import { Screen, ScreenHeader } from '../../ui/primitives';
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
    <Screen testID="saved-screen" padded={false}>
      {/*
        `Saved.dc.html` puts "only you" beside the title. That is not decoration:
        FR-039 is that a saved list is yours and nobody else's, and a person
        deciding whether to save something they would not post is deciding on
        exactly that. A guarantee the product makes and never states is one
        nobody can rely on.
      */}
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <ScreenHeader
          title="Saved"
          right={
            <Text style={{ ...textStyle.label, fontWeight: '400', color: palette.text.muted }}>
              only you
            </Text>
          }
        />
      </View>
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
