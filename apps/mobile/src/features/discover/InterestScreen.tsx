import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { Interest, InterestRef, Post } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle } from '../../ui/theme';
import { Screen, ScreenHeader } from '../../ui/primitives';
import { interestColour } from '../../ui/interest-colour';
import { PagedPostList, type PagedState } from '../../components/PagedPostList';
import { FollowInterestControl } from './FollowInterestControl';

export interface InterestScreenData {
  interest: Interest;
  /** Sub-interests whose posts are rolled up into this listing (FR-024). */
}

/**
 * 013/FR-021. THE ROLL-UP VIEW IS GONE.
 *
 * 001/FR-024 made a top-level space list its children's posts as well as its
 * own, and `rollsUpFrom` told this screen when to say so. Interests are flat, so
 * a space lists its own posts and nothing else. Kept as a function returning
 * false would be copy describing a withdrawn requirement — 007's follow hint.
 */

/**
 * 013/FR-021. `rollUpCaption` goes with the roll-up.
 *
 * It said "Including posts from N sub-interests" — a sentence about a behaviour
 * the product no longer has. FR-018 and T028 exist because 007 shipped exactly
 * this: copy left behind describing a withdrawn requirement.
 */

export function labelWithParent(ref: InterestRef): string {
  // 013. Flat: a name qualifies itself, because there is only one of it.
  return ref.name;
}

export const ORDERS: { key: 'new' | 'top'; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'top', label: 'Top' },
];

/**
 * FR-029. "No posts here" and "nothing matched" are different states.
 *
 * Collapsing them tells somebody an interest is empty when it is their search
 * that found nothing, which sends them away from a page full of posts.
 */
export function interestEmptyCopy(query: string): { title: string; body: string } {
  return query.trim().length > 0
    ? { title: 'Nothing matched', body: 'Try a different word, or clear the search.' }
    : { title: 'No posts yet', body: 'Be the first to post here.' };
}

export function InterestScreen({
  data,
  posts,
  followedCount,
  order,
  query,
  onLoadMore,
  onToggleFollow,
  onOrderChange,
  onQueryChange,
  onReportDescription,
  renderPost,
}: {
  data: InterestScreenData;
  posts: PagedState<Post>;
  followedCount: number;
  order?: 'new' | 'top';
  query?: string;
  onLoadMore: () => void;
  onToggleFollow: (next: boolean) => void;
  onOrderChange?: (next: 'new' | 'top') => void;
  onQueryChange?: (next: string) => void;
  onReportDescription?: () => void;
  renderPost: (post: Post, index: number) => React.ReactElement;
}) {
  const empty = interestEmptyCopy(query ?? '');

  return (
    <Screen testID="interest-screen">
      <View style={{ gap: space.sm }}>
        {/*
          006/FR-013. THE INTEREST'S OWN COLOUR, in the screen's own chrome.

          This is the product's premise made visible: every interest space looked
          identical, so the thing the whole app is organised around had no
          presence at all. A rule in the interest's derived colour is enough to
          tell two spaces apart at a glance (SC-003) without competing with the
          content below it.

          G1: this treatment belongs to INTERESTS ONLY. A place and a person must
          never carry it - following a place deliberately does not put its posts
          in your feed (004/FR-019), and a shared visual language would say it
          does. `interest-treatment.test.ts` fails if it spreads.
        */}
        <View
          testID="interest-identity"
          style={{
            height: 4,
            width: 56,
            borderRadius: radius.pill,
            backgroundColor: interestColour(
              {
                interestId: data.interest.interestId,

              },
              palette,
            ),
          }}
        />
        <ScreenHeader title={data.interest.name} />
        <Text testID="interest-counts" style={{ ...textStyle.caption, color: palette.text.muted }}>
          {data.interest.postCount} posts · {data.interest.followerCount} followers
        </Text>

        {/*
          004/FR-025. The description was already returned by the API and had
          never been rendered - the interest page said what an interest is
          CALLED and nothing about what it is FOR.
        */}
        {data.interest.description ? (
          <View style={{ gap: space.xs }}>
            <Text testID="interest-description" style={{ ...textStyle.body, color: palette.text.primary }}>
              {data.interest.description}
            </Text>
            {onReportDescription ? (
              <Pressable testID="report-description" onPress={onReportDescription}>
                <Text style={{ ...textStyle.caption, color: palette.text.muted }}>Report this description</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <FollowInterestControl
          interest={data.interest}
          followedCount={followedCount}
          onToggle={onToggleFollow}
        />
      </View>

      {/*
        013/FR-003. The "Within <interest>" strip is gone: interests are flat, so
        an interest contains no others.
      */}

      {/* 004/FR-027 to FR-029. Order and search sit directly above the list
          they act on, so it is obvious which set they are changing. */}
      {onOrderChange || onQueryChange ? (
        <View testID="interest-controls" style={{ gap: space.sm }}>
          {onQueryChange ? (
            <TextInput
              testID="in-interest-search"
              accessibilityLabel={`Search within ${data.interest.name}`}
              placeholder={`Search within ${data.interest.name}`}
              placeholderTextColor={palette.text.muted}
              value={query ?? ''}
              onChangeText={onQueryChange}
              autoCorrect={false}
              style={{
                borderWidth: 1,
                borderColor: palette.line.hairline,
                borderRadius: radius.md,
                padding: space.sm,
                ...textStyle.body,
                color: palette.text.primary,
              }}
            />
          ) : null}
          {onOrderChange ? (
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {ORDERS.map((o) => (
                <Pressable
                  key={o.key}
                  testID={`order-${o.key}`}
                  accessibilityRole="button"
                  onPress={() => onOrderChange(o.key)}
                  style={{
                    paddingVertical: space.xs,
                    paddingHorizontal: space.md,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: (order ?? 'new') === o.key ? palette.intent.accent : palette.line.hairline,
                  }}
                >
                  <Text
                    style={{
                      ...textStyle.caption,
                      color: (order ?? 'new') === o.key ? palette.intent.accent : palette.text.muted,
                    }}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <PagedPostList
        state={posts}
        keyOf={(p) => p.postId}
        renderItem={renderPost}
        onLoadMore={onLoadMore}
        empty={empty}
      />
    </Screen>
  );
}
