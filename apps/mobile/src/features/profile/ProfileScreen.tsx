import { Pressable, Text, View } from 'react-native';
import type { InterestRef, Post } from '@sih/shared';
import { activePalette as palette, space, textStyle, MIN_TOUCH_TARGET } from '../../ui/theme';
import { Screen } from '../../ui/primitives';
import { Avatar } from '../../components/Avatar';
import { PagedPostList, type PagedState } from '../../components/PagedPostList';

export interface ProfileData {
  handle: string;
  displayName: string;
  /** 008/FR-017. A presigned url, or null for the derived initial (FR-019). */
  avatarUrl?: string | null;
  bio: string | null;
  followerCount: number;
  followingCount: number;
  topInterests: InterestRef[];
  viewerIsFollowing: boolean;
  /**
   * Only `/v1/me` returns this, so it is optional and the third stat simply is
   * not drawn on someone else's profile. The artboard shows three; inventing a
   * post count the API does not send would be drawing the design rather than
   * the product.
   */
  interestFollowCount?: number;
}

/**
 * FR-038, rewritten for 007/FR-029 — AND THE OLD COPY WAS SAYING SOMETHING
 * UNTRUE.
 *
 * It read "gives this person's posts prominence inside interests the viewer
 * ALREADY follows (FR-033)". 001/FR-033 is WITHDRAWN: a ranked feed has no
 * followed-interest set to be confined to, so there is no "inside interests you
 * follow" for a boost to happen in. The screen was describing the composed feed
 * to somebody using the ranked one.
 *
 * What a follow does now is 007/FR-029: a bounded boost that REORDERS and never
 * admits. Their posts rank higher when they turn up; following does not put
 * anything in your feed that was not eligible for it already. That distinction
 * is the whole of Principle I after the amendment, so the sentence says it.
 */
export function followHint(profile: ProfileData): string {
  return profile.viewerIsFollowing
    ? 'Their posts rank higher in your feed. Following does not add anything new to it.'
    : 'Following ranks their posts higher when they appear. It does not widen your feed.';
}

function Stat({ value, label, testID }: { value: number; label: string; testID?: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 2 }}>
      <Text testID={testID} style={{ ...textStyle.title, color: palette.text.primary }}>
        {value}
      </Text>
      <Text style={{ ...textStyle.caption, color: palette.text.muted }}>{label}</Text>
    </View>
  );
}

/**
 * The artboard's outlined pill. Two of them sit side by side under the bio and
 * neither is the primary action on the screen — that is the content below — so
 * they are outlined rather than filled. `Button`'s secondary variant is a
 * FILLED sunken block, which reads as heavier than the design intends here.
 */
function PillButton({
  label,
  testID,
  onPress,
  disabled,
  emphasis = 'quiet',
}: {
  label: string;
  testID: string;
  onPress: () => void;
  disabled?: boolean;
  emphasis?: 'quiet' | 'accent';
}) {
  const accent = emphasis === 'accent' && !disabled;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      style={{
        flexGrow: 1,
        flexBasis: 0,
        minHeight: MIN_TOUCH_TARGET,
        borderRadius: 20,
        borderWidth: accent ? 0 : 1,
        borderColor: palette.line.strong,
        backgroundColor: accent ? palette.intent.accent : 'transparent',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          ...textStyle.body,
          fontWeight: '600',
          color: disabled
            ? palette.text.muted
            : accent
              ? palette.text.onAccent
              : palette.text.primary,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * The Posts / Saved strip from `Profile.dc.html`.
 *
 * Saved NAVIGATES rather than swapping the list in place: it is its own route
 * with its own container and its own paging state, and `open-saved` is the
 * testID a journey selects. Collapsing two paged lists into one screen to match
 * a picture would be rewriting working navigation for a visual, and the visual
 * is the same either way.
 */
function ProfileTabs({ onOpenSaved }: { onOpenSaved: () => void }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: space.xl,
        paddingHorizontal: space.lg,
        paddingTop: 18,
        borderBottomWidth: 1,
        borderBottomColor: palette.line.hairline,
      }}
    >
      <View style={{ alignItems: 'center', gap: 9, minHeight: MIN_TOUCH_TARGET }}>
        <Text style={{ ...textStyle.body, fontWeight: '600', color: palette.text.primary }}>
          Posts
        </Text>
        <View style={{ height: 2.5, width: 30, borderRadius: 2, backgroundColor: palette.intent.accent }} />
      </View>
      <Pressable
        testID="open-saved"
        accessibilityRole="tab"
        accessibilityState={{ selected: false }}
        accessibilityLabel="Saved"
        onPress={onOpenSaved}
        style={{ alignItems: 'center', gap: 9, minHeight: MIN_TOUCH_TARGET }}
      >
        <Text style={{ ...textStyle.body, fontWeight: '500', color: palette.text.muted }}>Saved</Text>
        <View style={{ height: 2.5, width: 30, borderRadius: 2, backgroundColor: 'transparent' }} />
      </Pressable>
    </View>
  );
}

export function ProfileScreen({
  profile,
  posts,
  isSelf,
  followPending = false,
  onToggleFollow,
  onMessage,
  onLoadMore,
  renderPost,
  onEditProfile,
  onOpenSaved,
}: {
  profile: ProfileData;
  posts: PagedState<Post>;
  isSelf: boolean;
  /** Disables the control while the server decides. FR-034 can refuse. */
  followPending?: boolean;
  onToggleFollow: (next: boolean) => void;
  /** 004/FR-001. Absent on your own profile - you cannot message yourself. */
  onMessage?: () => void;
  onLoadMore: () => void;
  renderPost: (post: Post, index: number) => React.ReactElement;
  /** 007/T051. Both were loose Buttons under this screen in `App.tsx`; the
   *  artboard puts them on the profile itself. The testIDs are unchanged. */
  onEditProfile?: () => void;
  onOpenSaved?: () => void;
}) {
  return (
    <Screen testID="profile-screen" padded={false}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: space.lg,
          minHeight: 46,
        }}
      >
        <Text style={{ ...textStyle.title, color: palette.text.primary }}>@{profile.handle}</Text>
      </View>

      <View style={{ paddingHorizontal: space.lg, paddingTop: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18 }}>
          <Avatar
            userId={profile.handle}
            displayName={profile.displayName}
            url={profile.avatarUrl ?? null}
            size={74}
          />
          <View style={{ flexGrow: 1, flexDirection: 'row', justifyContent: 'space-around' }}>
            <Stat testID="follower-count" value={profile.followerCount} label="followers" />
            <Stat testID="following-count" value={profile.followingCount} label="following" />
            {profile.interestFollowCount === undefined ? null : (
              <Stat
                testID="interest-follow-count"
                value={profile.interestFollowCount}
                label="interests"
              />
            )}
          </View>
        </View>

        <View style={{ paddingTop: 14, gap: 4 }}>
          <Text style={{ ...textStyle.title, letterSpacing: -0.25, color: palette.text.primary }}>
            {profile.displayName}
          </Text>
          {profile.bio ? (
            <Text style={{ ...textStyle.body, color: palette.text.secondary }}>{profile.bio}</Text>
          ) : null}
          {profile.topInterests.length > 0 ? (
            <Text testID="top-interests" style={{ ...textStyle.caption, color: palette.intent.accent }}>
              {profile.topInterests.map((i) => i.name).join(' · ')}
            </Text>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 9, paddingTop: 14 }}>
          {isSelf ? (
            onEditProfile ? (
              <PillButton testID="open-edit-profile" label="Edit profile" onPress={onEditProfile} />
            ) : null
          ) : (
            <>
              <PillButton
                testID="follow-person-toggle"
                label={profile.viewerIsFollowing ? 'Following' : 'Follow'}
                emphasis={profile.viewerIsFollowing ? 'quiet' : 'accent'}
                disabled={followPending}
                onPress={() => onToggleFollow(!profile.viewerIsFollowing)}
              />
              {/*
                004/FR-001. The ONE entry point to a conversation from inside the
                product. Without it the whole chat surface is reachable only from
                an inbox that starts empty, which is the "screen exists, nothing
                opens it" shape four times over in this codebase.
              */}
              {onMessage ? (
                <PillButton testID="message-person" label="Message" onPress={onMessage} />
              ) : null}
            </>
          )}
        </View>

        {!isSelf ? (
          <Text
            testID="follow-hint"
            style={{ ...textStyle.caption, color: palette.text.muted, paddingTop: space.sm }}
          >
            {followHint(profile)}
          </Text>
        ) : null}
      </View>

      {isSelf && onOpenSaved ? <ProfileTabs onOpenSaved={onOpenSaved} /> : null}

      {/*
        A THREE-COLUMN GRID, two points apart — `Profile.dc.html`, and run 46's
        device capture is what caught that it was not one. The profile shipped
        rendering full-width cards in a single column: I built this screen's
        header, marked T051 done, and left the content as the old list. Every
        test asserted the post was PRESENT, and it was.
      */}
      <PagedPostList
        state={posts}
        keyOf={(p) => p.postId}
        renderItem={renderPost}
        onLoadMore={onLoadMore}
        columns={3}
        gap={2}
        empty={{ title: 'No posts yet', body: isSelf ? 'Your posts will appear here.' : 'Nothing to show.' }}
      />
    </Screen>
  );
}
