import { FlatList, Pressable, Text, View } from 'react-native';
import type { Interest, InterestRef, Post } from '@sih/shared';
import { theme } from '../../ui/theme';
import { Screen } from '../../ui/primitives';
import { PagedPostList, type PagedState } from '../../components/PagedPostList';
import { FollowInterestControl } from './FollowInterestControl';

export interface InterestScreenData {
  interest: Interest;
  subInterests?: Interest[];
  /** Sub-interests whose posts are rolled up into this listing (FR-024). */
  rollsUpFrom: string[];
}

/** FR-025: a top-level interest shows its sub-interests AND their posts. */
export function isRollUpView(data: InterestScreenData): boolean {
  return data.interest.level === 'top' && data.rollsUpFrom.length > 0;
}

/** Explains where rolled-up posts came from, so the listing is not surprising. */
export function rollUpCaption(data: InterestScreenData): string | null {
  if (!isRollUpView(data)) return null;
  const n = data.rollsUpFrom.length;
  return `Including posts from ${n} sub-interest${n === 1 ? '' : 's'}`;
}

export function labelWithParent(ref: InterestRef): string {
  return ref.parent ? `${ref.name} · ${ref.parent.name}` : ref.name;
}

export function InterestScreen({
  data,
  posts,
  followedCount,
  onLoadMore,
  onToggleFollow,
  onOpenSubInterest,
  renderPost,
}: {
  data: InterestScreenData;
  posts: PagedState<Post>;
  followedCount: number;
  onLoadMore: () => void;
  onToggleFollow: (next: boolean) => void;
  onOpenSubInterest: (interestId: string) => void;
  renderPost: (post: Post, index: number) => React.ReactElement;
}) {
  const caption = rollUpCaption(data);

  return (
    <Screen testID="interest-screen">
      <View style={{ gap: theme.space.sm }}>
        <Text style={{ fontSize: theme.font.xl, fontWeight: '700', color: theme.color.text }}>
          {data.interest.name}
        </Text>
        <Text style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
          {data.interest.postCount} posts · {data.interest.followerCount} followers
        </Text>
        <FollowInterestControl
          interest={data.interest}
          followedCount={followedCount}
          onToggle={onToggleFollow}
        />
      </View>

      {data.subInterests && data.subInterests.length > 0 ? (
        <View testID="sub-interest-list" style={{ gap: theme.space.sm }}>
          <Text style={{ fontSize: theme.font.sm, color: theme.color.muted }}>Within {data.interest.name}</Text>
          <FlatList
            horizontal
            data={data.subInterests}
            keyExtractor={(i) => i.interestId}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.space.sm }}
            renderItem={({ item, index }) => (
              <Pressable
                testID={`sub-interest-${index}`}
                accessibilityRole="button"
                onPress={() => onOpenSubInterest(item.interestId)}
                style={{
                  paddingVertical: theme.space.sm,
                  paddingHorizontal: theme.space.md,
                  borderRadius: theme.radius.pill,
                  borderWidth: 1,
                  borderColor: theme.color.border,
                }}
              >
                <Text style={{ fontSize: theme.font.sm, color: theme.color.text }}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}

      {caption ? (
        <Text testID="rollup-caption" style={{ fontSize: theme.font.sm, color: theme.color.muted }}>
          {caption}
        </Text>
      ) : null}

      <PagedPostList
        state={posts}
        keyOf={(p) => p.postId}
        renderItem={renderPost}
        onLoadMore={onLoadMore}
        empty={{ title: 'No posts yet', body: `Be the first to post in ${data.interest.name}.` }}
      />
    </Screen>
  );
}
