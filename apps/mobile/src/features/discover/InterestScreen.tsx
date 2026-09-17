import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import type { Interest, InterestRef, Post } from '@sih/shared';
import { activePalette as palette, MIN_TOUCH_TARGET, radius, space, textStyle, font } from '../../ui/theme';
import { Row, Screen, ScreenHeader } from '../../ui/primitives';
import { interestColour } from '../../ui/interest-colour';
import { PagedPostList, type PagedState } from '../../components/PagedPostList';
import { FollowInterestControl } from './FollowInterestControl';

export interface InterestScreenData {
  interest: Interest;
  // 013/FR-021. `rollsUpFrom` lived here. A doc comment for a field that is gone
  // is the copy half of the same defect, so it goes with the field.
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
      {/*
        012/T039. A CARD, per `InterestSpace.dc.html` — and this screen had no
        artboard at all until 012, which is why it drifted.

        It was a 4pt rule, a plain header, a caption of counts and a follow
        control stacked down the page as five separate things. The artboard
        gathers them into one raised card: the name in the interest's own
        colour, Follow on the same line, the description under it and the two
        counts at the bottom. The premise of the product deserves a header that
        looks composed rather than assembled.
      */}
      <View
        style={{
          backgroundColor: palette.bg.raised,
          borderRadius: radius.md,
          padding: space.md,
          gap: space.sm,
        }}
      >
        <Row style={{ alignItems: 'center', gap: space.sm }}>
          {/*
            006/FR-013. THE INTEREST'S OWN COLOUR, in the screen's own chrome.

            This is the product's premise made visible: every interest space
            looked identical, so the thing the whole app is organised around had
            no presence at all. The artboard puts the colour on the NAME rather
            than on a rule beside it, which is the same treatment a coloured
            word gets everywhere else (007) — one idea, not two.

            G1: this treatment belongs to INTERESTS ONLY. A place and a person
            must never carry it — following a place deliberately does not put
            its posts in your feed (004/FR-019), and a shared visual language
            would say it does. `interest-treatment.test.ts` fails if it spreads.
          */}
          <View
            testID="interest-identity"
            style={{
              height: 4,
              width: 56,
              borderRadius: radius.pill,
              backgroundColor: interestColour({ interestId: data.interest.interestId }, palette),
            }}
          />
          <View style={{ flex: 1 }} />
          <FollowInterestControl
            interest={data.interest}
            followedCount={followedCount}
            onToggle={onToggleFollow}
          />
        </Row>

        {/*
          012/T039, 007. THE NAME IS THE COLOURED WORD — `InterestSpace.dc.html`
          puts the interest's own colour on the name itself, which is the same
          treatment it gets on a card, on a tile and in the cold start. A plain
          heading beside a coloured rule was two ideas for one thing.

          `ScreenHeader` is not used here for that reason: it takes a title, not
          a colour, and widening it would push the interest treatment into a
          shared primitive that a place and a person also use — which is exactly
          what G1 and `interest-treatment.test.ts` forbid.
        */}
        <Text
          testID="interest-name"
          accessibilityRole="header"
          style={{
            ...textStyle.title,
            color: interestColour({ interestId: data.interest.interestId }, palette),
          }}
        >
          {data.interest.name}
        </Text>

        {/*
          004/FR-025. The description was already returned by the API and had
          never been rendered - the interest page said what an interest is
          CALLED and nothing about what it is FOR.
        */}
        {data.interest.description ? (
          <View style={{ gap: space.xs }}>
            <Text testID="interest-description" style={{ ...textStyle.body, color: palette.text.secondary }}>
              {data.interest.description}
            </Text>
            {onReportDescription ? (
              <Pressable
                testID="report-description"
                /*
                  A SIZED BOX, NOT `hitSlop`, and the reason is worth stating:
                  this file is in the touch-target guard's `ALLOWED` list as a
                  whole-row-target file, so a `hitSlop` added here would not be
                  measured by anything. That allowance was argued for the post
                  rows; borrowing it for a small text link is the per-file
                  weakness 007 took out of the sized branch and 011 took out of
                  the slop branch, arriving by a third route.

                  44 tall and 44 wide is true here and needs no registry entry.
                */
                style={{
                  alignSelf: 'flex-start',
                  minHeight: MIN_TOUCH_TARGET,
                  minWidth: MIN_TOUCH_TARGET,
                  justifyContent: 'center',
                }}
                onPress={onReportDescription}
              >
                <Text style={{ ...textStyle.caption, color: palette.text.muted }}>Report this description</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/*
          012/T039. THE NUMBERS CARRY THE EMPHASIS, per the artboard: the count
          is what somebody is reading and the word is the unit. It was one flat
          muted caption, which reads as chrome rather than as information — and
          013 gave `postCount` a writer, so it is finally worth reading.
        */}
        {/* A `View`, not the shared `Row`, which takes no testID — and
            `interest-counts` is in the testID snapshot and in two flows. */}
        <View testID="interest-counts" style={{ flexDirection: 'row', gap: 18 }}>
          <Text style={{ ...textStyle.small, color: palette.text.muted }}>
            <Text style={{ color: palette.text.primary, ...font('700') }}>
              {data.interest.postCount.toLocaleString('en-US')}
            </Text>
            {` ${data.interest.postCount === 1 ? 'post' : 'posts'}`}
          </Text>
          <Text style={{ ...textStyle.small, color: palette.text.muted }}>
            <Text style={{ color: palette.text.primary, ...font('700') }}>
              {data.interest.followerCount.toLocaleString('en-US')}
            </Text>
            {` ${data.interest.followerCount === 1 ? 'follower' : 'followers'}`}
          </Text>
        </View>
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
