import { Text, View } from 'react-native';
import type { InterestRef, Post } from '@sih/shared';
import { theme } from '../../ui/theme';
import { Button, Row, Screen } from '../../ui/primitives';
import { PagedPostList, type PagedState } from '../../components/PagedPostList';

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
 * FR-038. The follow button explains what following actually does, because here
 * it does something narrower than people expect: it gives this person's posts
 * prominence inside interests the viewer ALREADY follows (FR-033), and grants
 * access to their followers-only posts (FR-015). It does not add their other
 * interests to the feed.
 */
export function followHint(profile: ProfileData, viewerFollowsAnyOfTheirInterests: boolean): string {
  if (profile.viewerIsFollowing) {
    return viewerFollowsAnyOfTheirInterests
      ? 'Their posts appear higher in the interests you follow.'
      : 'Follow one of their interests to see their posts in your feed.';
  }
  return 'Following shows their posts higher in interests you already follow.';
}

export function ProfileScreen({
  profile,
  posts,
  viewerFollowsAnyOfTheirInterests,
  isSelf,
  followPending = false,
  onToggleFollow,
  onMessage,
  onLoadMore,
  renderPost,
}: {
  profile: ProfileData;
  posts: PagedState<Post>;
  viewerFollowsAnyOfTheirInterests: boolean;
  isSelf: boolean;
  /** Disables the control while the server decides. FR-034 can refuse. */
  followPending?: boolean;
  onToggleFollow: (next: boolean) => void;
  /** 004/FR-001. Absent on your own profile - you cannot message yourself. */
  onMessage?: () => void;
  onLoadMore: () => void;
  renderPost: (post: Post, index: number) => React.ReactElement;
}) {
  return (
    <Screen testID="profile-screen">
      <View style={{ gap: theme.space.sm }}>
        <Text style={{ fontSize: theme.font.xl, fontWeight: '700', color: theme.color.text }}>
          {profile.displayName}
        </Text>
        <Text style={{ fontSize: theme.font.sm, color: theme.color.muted }}>@{profile.handle}</Text>
        {profile.bio ? <Text style={{ fontSize: theme.font.md, color: theme.color.text }}>{profile.bio}</Text> : null}

        <Row>
          <Text testID="follower-count" style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
            {profile.followerCount} followers
          </Text>
          <Text testID="following-count" style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
            {profile.followingCount} following
          </Text>
        </Row>

        {profile.topInterests.length > 0 ? (
          <Text testID="top-interests" style={{ fontSize: theme.font.sm, color: theme.color.accent }}>
            {profile.topInterests.map((i) => i.name).join(' · ')}
          </Text>
        ) : null}

        {!isSelf ? (
          <View style={{ gap: theme.space.xs }}>
            <Button
              testID="follow-person-toggle"
              label={profile.viewerIsFollowing ? 'Following' : 'Follow'}
              variant={profile.viewerIsFollowing ? 'secondary' : 'primary'}
              disabled={followPending}
              onPress={() => onToggleFollow(!profile.viewerIsFollowing)}
            />
            <Text testID="follow-hint" style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
              {followHint(profile, viewerFollowsAnyOfTheirInterests)}
            </Text>
            {/*
              004/FR-001. The ONE entry point to a conversation from inside the
              product. Without it the whole chat surface is reachable only from
              an inbox that starts empty, which is the "screen exists, nothing
              opens it" shape four times over in this codebase.
            */}
            {onMessage ? (
              <Button
                testID="message-person"
                label="Message"
                variant="secondary"
                onPress={onMessage}
              />
            ) : null}
          </View>
        ) : null}
      </View>

      <PagedPostList
        state={posts}
        keyOf={(p) => p.postId}
        renderItem={renderPost}
        onLoadMore={onLoadMore}
        empty={{ title: 'No posts yet', body: isSelf ? 'Your posts will appear here.' : 'Nothing to show.' }}
      />
    </Screen>
  );
}
