import { Pressable, Text, View } from 'react-native';
import type { Post } from '@sih/shared';
import { activePalette as palette, radius, space, textStyle, touchTarget, type } from '../../ui/theme';
import { Screen } from '../../ui/primitives';
import { Waterfall } from '../../components/Waterfall';
import type { PagedState } from '../../components/PagedPostList';

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

/**
 * 007/FR-001, FR-010, FR-021 — THE FEED.
 *
 * Rebuilt from `design/007-ui/Main.dc.html`. Three things it deliberately does
 * NOT have, each of which an earlier pass did:
 *
 *  - **No sections.** One blended stream. The owner's instruction was that the
 *    app should just show posts, and that the server should learn from what you
 *    do with them — sectioning by interest is the subscription feed's shape
 *    surviving the feature that removed it.
 *  - **No explanation.** Nothing says why a post is where it is (FR-010). It is
 *    all done by the backend and there is no need to say so; the disclosure
 *    lives once, in Settings.
 *  - **No shadow, and no chrome competing with the media.** A title, two tabs,
 *    and the waterfall.
 *
 * 008/US3 — BOTH TABS ARE REAL NOW.
 *
 * "Following" was rendered DISABLED with a comment here saying it was not built.
 * That was honest rather than a lie — it avoided repeating the defect 003 found
 * on the profile, a follow button wired to `() => undefined` — and it was still
 * a promise the product made and did not keep for a whole feature.
 *
 * "For you" is ranked from behaviour; "Following" is chronological, unranked and
 * records no signal. Which tab is selected is the CALLER's state, so the two
 * feeds keep their own cursors: the ranked one's is an opaque token holding what
 * this session has been shown, and Following's is a timestamp, and feeding
 * either to the other would repeat posts or skip them.
 */
export function HomeFeedScreen({
  state,
  onLoadMore,
  onEmptyAction,
  onViewableChanged,
  renderPost,
  tab = 'for-you',
  onSelectTab,
}: {
  state: PagedState<Post>;
  onLoadMore: () => void;
  onEmptyAction: (action: EmptyStateCopy['action']) => void;
  /** 008/FR-008. Which feed is showing. Defaults so existing render tests hold. */
  tab?: 'for-you' | 'following';
  onSelectTab?: (tab: 'for-you' | 'following') => void;
  /** 007/FR-004. Absent in tests that render this screen directly. */
  onViewableChanged?: (postIds: string[]) => void;
  renderPost: (post: Post, index: number) => React.ReactElement;
}) {
  const copy = emptyStateCopy(state.emptyStateHint as FeedEmptyState);

  return (
    <Screen testID="home-feed-screen" padded={false}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.lg,
          paddingBottom: space.sm,
        }}
      >
        <Text
          style={{
            ...textStyle.display,
            fontWeight: type.display.weight,
            letterSpacing: -0.4,
            color: palette.text.primary,
          }}
        >
          Interest
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          gap: space.xl,
          paddingHorizontal: space.lg,
          paddingBottom: space.sm,
        }}
      >
        <Pressable
          testID="feed-tab-for-you"
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'for-you' }}
          onPress={() => onSelectTab?.('for-you')}
          style={{ ...touchTarget, minWidth: undefined, alignItems: 'center', gap: 6 }}
        >
          <Text
            style={{
              ...textStyle.body,
              fontWeight: tab === 'for-you' ? '600' : '500',
              color: tab === 'for-you' ? palette.text.primary : palette.text.muted,
            }}
          >
            For you
          </Text>
          {/* The rule marks the selected tab. Rendered only under it rather than
              recoloured, so the two tabs cannot both appear selected. */}
          {tab === 'for-you' ? (
            <View
              style={{
                width: 20,
                height: 2.5,
                borderRadius: radius.pill,
                backgroundColor: palette.intent.accent,
              }}
            />
          ) : null}
        </Pressable>
        <Pressable
          testID="feed-tab-following"
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === 'following' }}
          onPress={() => onSelectTab?.('following')}
          style={{ ...touchTarget, minWidth: undefined, alignItems: 'center', gap: 6 }}
        >
          <Text
            style={{
              ...textStyle.body,
              fontWeight: tab === 'following' ? '600' : '500',
              color: tab === 'following' ? palette.text.primary : palette.text.muted,
            }}
          >
            Following
          </Text>
          {tab === 'following' ? (
            <View
              style={{
                width: 20,
                height: 2.5,
                borderRadius: radius.pill,
                backgroundColor: palette.intent.accent,
              }}
            />
          ) : null}
        </Pressable>
      </View>

      <Waterfall
        state={state}
        renderPost={renderPost}
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
