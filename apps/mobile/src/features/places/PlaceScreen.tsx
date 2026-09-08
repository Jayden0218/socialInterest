import { Text, View } from 'react-native';
import type { Place, Post, Review } from '@sih/shared';
import { activePalette as palette, space, type } from '../../ui/theme';
import { Button, Row, Screen } from '../../ui/primitives';
import { PagedPostList, type PagedState } from '../../components/PagedPostList';
import { RatingControl } from './RatingControl';
import { ReviewList } from './ReviewList';

/**
 * FR-016. A place page shows the posts filed to it, and - as of 005 - its
 * ratings and reviews.
 *
 * THIS COMMENT USED TO SAY "no ratings, no reviews", and the reasoning behind
 * that is worth keeping rather than deleting: each is a distinct content type
 * with its own moderation and abuse profile, and folding one in as "just a
 * field" is how safety work gets deferred. The owner brought both into scope in
 * 005, so the answer is not that the concern was wrong - it is that reviews
 * arrive WITH their reporting and moderation, inside the same story (plan gate
 * G2), rather than as a field somebody adds and secures later.
 *
 * Still deliberately absent: opening hours, bookings, menus. Each remains its
 * own content type with its own problems.
 */
export function PlaceScreen({
  place,
  posts,
  reviews,
  reviewBody,
  savingReview,
  signedIn,
  followPending,
  onToggleFollow,
  onLoadMore,
  onReport,
  onRate,
  onWithdrawRating,
  onChangeReviewBody,
  onReportReview,
  renderPost,
}: {
  place: Place;
  posts: PagedState<Post>;
  reviews?: Review[];
  reviewBody?: string;
  savingReview?: boolean;
  signedIn?: boolean;
  followPending?: boolean;
  onToggleFollow: (next: boolean) => void;
  onLoadMore: () => void;
  onReport: () => void;
  onRate?: (score: number) => void;
  onWithdrawRating?: () => void;
  onChangeReviewBody?: (body: string) => void;
  onReportReview?: (placeId: string, authorId: string) => void;
  renderPost: (post: Post) => React.ReactElement;
}) {
  return (
    <Screen testID="place-screen">
      <View style={{ padding: space.sm, gap: space.xs }}>
        <Text testID="place-name" style={{ fontSize: type.title.size,
 lineHeight: type.title.lineHeight, color: palette.text.primary, fontWeight: '600' }}>
          {place.name}
        </Text>
        <Text testID="place-meta" style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.text.muted }}>
          {place.category} · {place.locality}
          {place.address ? ` · ${place.address}` : ''}
        </Text>
        <Text testID="place-follower-count" style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.text.muted }}>
          {place.followerCount} following
        </Text>

        {place.interests && place.interests.length > 0 ? (
          <Text testID="place-interests" style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.intent.accent }}>
            {place.interests.map((i) => i.name).join(' · ')}
          </Text>
        ) : null}

        <Row style={{ gap: space.sm }}>
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
        <Text testID="place-follow-hint" style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.text.muted }}>
          Following a place saves it for you. Posts reach your feed through the interests you follow.
        </Text>
      </View>

      {/*
        005/US1, US2. Below the place's own details and above its posts: the
        rating is about the place, so it belongs with the place rather than at
        the end of a list of posts.

        `ratingSummary` is optional in the contract because a place written
        before 005 has no counters, so this falls back to an explicitly UNRATED
        summary - not to zero, which would read as "everybody rated it badly".
      */}
      <RatingControl
        summary={place.ratingSummary ?? { average: null, count: 0 }}
        viewerRating={place.viewerRating ?? null}
        signedIn={signedIn === true}
        body={reviewBody ?? ''}
        {...(savingReview !== undefined ? { saving: savingReview } : {})}
        onRate={(score) => onRate?.(score)}
        onWithdraw={() => onWithdrawRating?.()}
        onChangeBody={(b) => onChangeReviewBody?.(b)}
      />

      {reviews ? (
        <ReviewList reviews={reviews} onReport={(p, a) => onReportReview?.(p, a)} />
      ) : null}

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
