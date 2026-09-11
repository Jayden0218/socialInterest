/**
 * ProfileContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { PostTile } from '../components/PostCard';
import { useData } from '../data-provider';
import { DataError } from '../data';
import { ProfileScreen, type ProfileData } from '../features/profile/ProfileScreen';
import { useProfilePosts } from '../containers';
import { Failed } from './shared';

export function ProfileContainer({
  handle,
  isSelf,
  onOpenPost,
  onMessage,
  onEditProfile,
  onOpenSaved,
}: {
  handle: string;
  isSelf: boolean;
  onOpenPost: (postId: string) => void;
  /** 004/FR-001. Not passed for your own profile - you cannot message yourself. */
  onMessage?: (personHandle: string) => void;
  /** 007/T051. Only meaningful on your own profile, where the artboard puts
   *  Edit profile and the Saved tab. */
  onEditProfile?: () => void;
  onOpenSaved?: () => void;
}) {
  const data = useData();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [myInterests, setMyInterests] = useState<string[]>([]);
  // Your own posts need your REAL handle, not the literal "me" the tab passes
  // in. Until `GET /v1/me` resolves there is no handle to ask with, and asking
  // with "me" got a 404 and an empty list that explained nothing.
  const postsHandle = isSelf ? (profile?.handle ?? '') : handle;
  const { state, loadMore } = useProfilePosts(postsHandle);

  /**
   * T053. This used to call `session.me()` regardless of whose profile was
   * asked for, so every profile in the app was your own - opening someone
   * else's showed you yourself - and `viewerIsFollowing` was hardcoded false.
   */
  useEffect(() => {
    let live = true;
    const load = isSelf
      ? data.session.me().then((me) => ({
          handle: me.handle,
          displayName: me.displayName,
          // 008/FR-017. Your own face, on your own profile.
          avatarUrl: me.avatarUrl ?? null,
          bio: me.bio ?? null,
          followerCount: me.followerCount ?? 0,
          followingCount: me.followingCount ?? 0,
          topInterests: me.topInterests ?? [],
          // `Profile.dc.html`'s third stat. Only `/v1/me` carries it, which is
          // why it is optional on `ProfileData` rather than defaulted to zero -
          // "0 interests" on somebody else's profile would be a claim, not an
          // absence.
          interestFollowCount: me.interestFollowCount,
          // You do not follow yourself, and ProfileScreen hides the control
          // when isSelf anyway.
          viewerIsFollowing: false,
        }))
      : data.people.get(handle).then((p) => ({
          handle: p.handle,
          displayName: p.displayName,
          avatarUrl: p.avatarUrl ?? null,
          bio: p.bio ?? null,
          followerCount: p.followerCount ?? 0,
          followingCount: p.followingCount ?? 0,
          topInterests: p.topInterests ?? [],
          // The SERVER's answer, computed per viewer. A client-side guess here
          // would show the wrong state to anyone who followed from elsewhere.
          viewerIsFollowing: p.viewerIsFollowing === true,
          /**
           * 008/FR-043. The server's own three-state answer. Absent from a
           * server without 008, and `followState()` falls back to the boolean —
           * which can express two of the three and never claims the third.
           */
          viewerFollowState: p.viewerFollowState,
          accountPrivacy: p.accountPrivacy,
        }));

    load
      .then((next) => live && setProfile(next))
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [data, handle, isSelf]);

  /**
   * FR-038 wants the follow hint to say whether this person's posts will
   * actually appear, which depends on whether the viewer follows any interest
   * they post in. That needs the viewer's own interests, so it is fetched
   * rather than assumed false - which is what made the hint always say
   * "follow one of their interests" even when you already did.
   */
  useEffect(() => {
    if (isSelf) return;
    let live = true;
    data.session
      .me()
      .then((me) => live && setMyInterests((me.topInterests ?? []).map((i) => i.interestId)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [data, isSelf]);

  const toggleFollow = useCallback(
    async (next: boolean) => {
      if (!profile) return;
      setPending(true);
      // Optimistic, then reconciled against the server's own answer below. The
      // server owns this - FR-034's follow cap means a request can be refused,
      // and a control that stayed switched would be lying about it.
      const before = { viewerIsFollowing: profile.viewerIsFollowing, viewerFollowState: profile.viewerFollowState };
      setProfile((p) => (p ? { ...p, viewerIsFollowing: next } : p));
      try {
        if (next) await data.people.follow(profile.handle);
        else await data.people.unfollow(profile.handle);
        const fresh = await data.people.get(profile.handle);
        /**
         * 008/FR-043 — AND THIS RE-READ IS WHY THE OPTIMISTIC UPDATE IS SAFE.
         *
         * Following a PRIVATE account does not make you a follower; it files a
         * request. The optimistic flip above says "Following" for one round
         * trip, and the server's own answer replaces it with "Requested" — a
         * client that guessed the outcome would say the wrong thing permanently.
         */
        setProfile((p) => (p ? { ...p, viewerIsFollowing: fresh.viewerIsFollowing === true,
          viewerFollowState: fresh.viewerFollowState,
          followerCount: fresh.followerCount ?? p.followerCount } : p));
      } catch (e: unknown) {
        setProfile((p) => (p ? { ...p, ...before } : p));
        setError(e instanceof DataError ? e.message : String(e));
      } finally {
        setPending(false);
      }
    },
    [data, profile],
  );

  if (error) return <Failed message={error} />;
  if (!profile) return <View testID="profile-loading" />;
  return (
    <ProfileScreen
      profile={profile}
      posts={state}
      isSelf={isSelf}
      followPending={pending}
      onToggleFollow={(next) => void toggleFollow(next)}
      {...(onMessage && !isSelf && profile.handle
        ? { onMessage: () => onMessage(profile.handle) }
        : {})}
      onLoadMore={loadMore}
      // A TILE, not a card. `Profile.dc.html` is a three-column grid; a card
      // carries a byline and an interest, which on somebody's own profile
      // repeat the header above them once per post.
      renderPost={(post) => <PostTile post={post} onOpen={onOpenPost} />}
      {...(isSelf && onEditProfile ? { onEditProfile } : {})}
      {...(isSelf && onOpenSaved ? { onOpenSaved } : {})}
    />
  );
}
