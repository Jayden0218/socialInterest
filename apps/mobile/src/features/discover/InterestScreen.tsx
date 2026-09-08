import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { Interest, InterestRef, Post } from '@sih/shared';
import { activePalette as palette, radius, space, type } from '../../ui/theme';
import { Screen } from '../../ui/primitives';
import { interestColour } from '../../ui/interest-colour';
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
  onOpenSubInterest,
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
  onOpenSubInterest: (interestId: string) => void;
  onOrderChange?: (next: 'new' | 'top') => void;
  onQueryChange?: (next: string) => void;
  onReportDescription?: () => void;
  renderPost: (post: Post, index: number) => React.ReactElement;
}) {
  const caption = rollUpCaption(data);
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
                parentId: data.interest.parentId ?? null,
              },
              palette,
            ),
          }}
        />
        <Text style={{ fontSize: type.display.size,
 lineHeight: type.display.lineHeight, fontWeight: '700', color: palette.text.primary }}>
          {data.interest.name}
        </Text>
        <Text testID="interest-counts" style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.text.muted }}>
          {data.interest.postCount} posts · {data.interest.followerCount} followers
        </Text>

        {/*
          004/FR-025. The description was already returned by the API and had
          never been rendered - the interest page said what an interest is
          CALLED and nothing about what it is FOR.
        */}
        {data.interest.description ? (
          <View style={{ gap: space.xs }}>
            <Text testID="interest-description" style={{ fontSize: type.body.size,
 lineHeight: type.body.lineHeight, color: palette.text.primary }}>
              {data.interest.description}
            </Text>
            {onReportDescription ? (
              <Pressable testID="report-description" onPress={onReportDescription}>
                <Text style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.text.muted }}>Report this description</Text>
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

      {data.subInterests && data.subInterests.length > 0 ? (
        <View testID="sub-interest-list" style={{ gap: space.sm }}>
          <Text style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.text.muted }}>Within {data.interest.name}</Text>
          <FlatList
            horizontal
            data={data.subInterests}
            keyExtractor={(i) => i.interestId}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: space.sm }}
            renderItem={({ item, index }) => (
              <Pressable
                testID={`sub-interest-${index}`}
                accessibilityRole="button"
                onPress={() => onOpenSubInterest(item.interestId)}
                style={{
                  paddingVertical: space.sm,
                  paddingHorizontal: space.md,
                  borderRadius: radius.pill,
                  borderWidth: 1,
                  borderColor: palette.line.hairline,
                }}
              >
                <Text style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.text.primary }}>{item.name}</Text>
              </Pressable>
            )}
          />
        </View>
      ) : null}

      {caption ? (
        <Text testID="rollup-caption" style={{ fontSize: type.caption.size,
 lineHeight: type.caption.lineHeight, color: palette.text.muted }}>
          {caption}
        </Text>
      ) : null}

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
                fontSize: type.body.size,
                lineHeight: type.body.lineHeight,
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
                      fontSize: type.caption.size,
                      lineHeight: type.caption.lineHeight,
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
