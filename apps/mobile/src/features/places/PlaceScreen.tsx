import { Text, View } from 'react-native';
import type { Place, Post } from '@sih/shared';
import { theme } from '../../ui/theme';
import { Button, Row, Screen } from '../../ui/primitives';
import { PagedPostList, type PagedState } from '../../components/PagedPostList';

/**
 * FR-016. A place page shows the posts filed to it - and nothing else.
 *
 * No ratings, no reviews, no opening hours, no bookings. Each is a distinct
 * content type with its own moderation and abuse profile, and folding one in
 * here as "just a field" is how safety work gets deferred (spec, Out of Scope,
 * and plan gate G2).
 */
export function PlaceScreen({
  place,
  posts,
  followPending,
  onToggleFollow,
  onLoadMore,
  onReport,
  renderPost,
}: {
  place: Place;
  posts: PagedState<Post>;
  followPending?: boolean;
  onToggleFollow: (next: boolean) => void;
  onLoadMore: () => void;
  onReport: () => void;
  renderPost: (post: Post) => React.ReactElement;
}) {
  return (
    <Screen testID="place-screen">
      <View style={{ padding: theme.space.sm, gap: theme.space.xs }}>
        <Text testID="place-name" style={{ fontSize: theme.font.lg, color: theme.color.text, fontWeight: '600' }}>
          {place.name}
        </Text>
        <Text testID="place-meta" style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
          {place.category} · {place.locality}
          {place.address ? ` · ${place.address}` : ''}
        </Text>
        <Text testID="place-follower-count" style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
          {place.followerCount} following
        </Text>

        {place.interests && place.interests.length > 0 ? (
          <Text testID="place-interests" style={{ fontSize: theme.font.sm, color: theme.color.accent }}>
            {place.interests.map((i) => i.name).join(' · ')}
          </Text>
        ) : null}

        <Row style={{ gap: theme.space.sm }}>
          <Button
            testID="follow-place-toggle"
            label={place.viewerIsFollowing ? 'Following' : 'Follow'}
            variant={place.viewerIsFollowing ? 'secondary' : 'primary'}
            disabled={followPending}
            onPress={() => onToggleFollow(!place.viewerIsFollowing)}
          />
          <Button testID="report-place" label="Report" variant="secondary" onPress={onReport} />
        </Row>

        {/*
          FR-019, said out loud to the person following. Following a place does
          NOT put its posts in your feed unless you also follow the interest -
          which is surprising, and a control that surprises people silently is a
          control they will misread.
        */}
        <Text testID="place-follow-hint" style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
          Following a place saves it for you. Posts reach your feed through the interests you follow.
        </Text>
      </View>

      {/* PagedPostList renders its own empty state - a second one here would
          race it and show both, or neither, depending on load order. */}
      <PagedPostList
        state={posts}
        keyOf={(post: Post) => post.postId}
        renderItem={renderPost}
        onLoadMore={onLoadMore}
        empty={{ title: 'No posts here yet', body: `Be the first to post from ${place.name}.` }}
      />
    </Screen>
  );
}
