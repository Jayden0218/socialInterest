import { useState } from 'react';
import { Text, View } from 'react-native';
import { HomeFeedScreen } from '../features/feed/HomeFeedScreen';
import { InterestSearchScreen } from '../features/discover/InterestSearchScreen';
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { useHomeFeed, useInterestSearch, useNotifications, usePaged } from '../containers';
import { theme } from '../ui/theme';

/**
 * Containers: they fetch, the screens render.
 *
 * The screens stay presentational and prop-driven. That is what keeps the 31
 * render tests free of a network, and what lets apps/e2e exercise the same data
 * modules in Node without React. The wiring lives here and nowhere else.
 *
 * A failed load renders its own error, never an empty list - showing "nothing
 * here yet" for a dropped connection is the mistake this shape prevents.
 */
function Failed({ message }: { message: string }) {
  return (
    <View testID="load-error" style={{ padding: theme.space.md }}>
      <Text style={{ color: theme.color.danger }}>{message}</Text>
    </View>
  );
}

export function HomeFeedContainer({ onEmptyAction }: { onEmptyAction: () => void }) {
  const { state, error, loadMore } = useHomeFeed();
  if (error) return <Failed message={error} />;
  return (
    <HomeFeedScreen
      state={state}
      onLoadMore={loadMore}
      onEmptyAction={onEmptyAction}
      renderPost={(post) => <Text testID={`post-${post.postId}`}>{post.caption ?? ''}</Text>}
    />
  );
}

export function DiscoverContainer({ onSelect }: { onSelect: (interestId: string) => void }) {
  const [query, setQuery] = useState('');
  const { state, error } = useInterestSearch(query);
  if (error) return <Failed message={error} />;
  return (
    <InterestSearchScreen
      query={query}
      results={state.items}
      onQueryChange={setQuery}
      onSelect={onSelect}
    />
  );
}

export function NotificationsContainer({ onOpen }: { onOpen: (id: string) => void }) {
  const { state, error } = useNotifications();
  if (error) return <Failed message={error} />;
  return (
    <NotificationsScreen
      notifications={state.items}
      prefs={{ reaction: true, comment: true, follow: true }}
      onOpen={(n) => onOpen(n.notificationId)}
      onEditPrefs={() => undefined}
    />
  );
}

/* --- post detail, comments, safety: the remaining screens, wired --- */

import { useCallback, useEffect } from 'react';
import type { Post } from '@sih/shared';
import { PostDetailScreen } from '../features/posts/PostDetailScreen';
import { CommentsScreen } from '../features/engagement/CommentsScreen';
import { SafetyActions, type ReportSubject } from '../features/safety/SafetyActions';
import { useData } from '../data-provider';
import { DataError } from '../data';

export function PostDetailContainer({ postId }: { postId: string }) {
  const data = useData();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    data.posts
      .get(postId)
      .then((p) => live && setPost(p))
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [data, postId]);

  if (error) return <Failed message={error} />;
  if (!post) return <View testID="post-loading" />;
  return <PostDetailScreen post={post} />;
}

export function CommentsContainer({ postId }: { postId: string }) {
  const data = useData();
  const { state, error, reload } = usePagedComments(postId);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<number | undefined>(undefined);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      await data.engagement.comment(postId, draft);
      setDraft('');
      setStatus(undefined);
      reload();
    } catch (err) {
      // The screen renders a message per status - a 403 on a followers-only post
      // means something different from a 429, and collapsing them would say the
      // wrong thing.
      setStatus(err instanceof DataError ? err.status : 0);
    } finally {
      setSubmitting(false);
    }
  }, [data, postId, draft, reload]);

  if (error) return <Failed message={error} />;
  return (
    <CommentsScreen
      comments={state.items}
      draft={draft}
      submitting={submitting}
      {...(status !== undefined ? { status } : {})}
      onDraftChange={setDraft}
      onSubmit={() => void submit()}
    />
  );
}

function usePagedComments(postId: string) {
  const data = useData();
  return usePaged((cursor) => data.engagement.comments(postId, cursor ? { cursor } : {}), [postId]);
}

export function SafetyContainer({
  subject,
  subjectId,
  authorHandle,
  onDone,
}: {
  subject: ReportSubject;
  subjectId: string;
  authorHandle?: string;
  onDone: () => void;
}) {
  const data = useData();
  const [reason, setReason] = useState<string | null>(null);

  return (
    <SafetyActions
      subject={subject}
      selectedReason={reason}
      onSelectReason={setReason}
      onReport={() => {
        if (!reason) return;
        void data.safety
          .report({
            subjectType: subject,
            subjectId,
            reason: reason as 'spam',
          })
          .then(onDone);
      }}
      {...(authorHandle ? { onBlock: () => void data.safety.block(authorHandle).then(onDone) } : {})}
    />
  );
}

/* --- sign in, interest space, compose, profile: the containers the shell was
       missing. Every screen below existed and was render-tested; none of them
       was reachable, because App.tsx mounted three containers and there was no
       navigation to the rest. --- */

import { SignInScreen, SignedOutNotice } from '../features/auth/SignInScreen';
import { InterestScreen, type InterestScreenData } from '../features/discover/InterestScreen';
import { ProfileScreen, type ProfileData } from '../features/profile/ProfileScreen';
import { ComposeScreen, newSlot, runUpload, type UploadSlot } from '../features/publish/ComposeScreen';
import type { PickedMedia } from '../features/publish/MediaPickerScreen';
import { DEFAULT_VISIBILITY } from '../features/publish/VisibilityControl';
import { useInterestPosts, useProfilePosts } from '../containers';
import type { InterestRef, Visibility } from '@sih/shared';

export function SignInContainer({ onSignedIn }: { onSignedIn: () => void }) {
  const data = useData();
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      await data.session.signIn(token.trim());
      onSignedIn();
    } catch (e: unknown) {
      // signIn calls GET /v1/me with the token, so a rejected token fails here
      // rather than being stored and failing on every later screen.
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [data, token, onSignedIn]);

  return (
    <SignInScreen
      token={token}
      submitting={submitting}
      error={error}
      onTokenChange={setToken}
      onSubmit={() => void submit()}
    />
  );
}

export { SignedOutNotice };

export function InterestContainer({
  interestId,
  onOpenSubInterest,
}: {
  interestId: string;
  onOpenSubInterest: (id: string) => void;
}) {
  const data = useData();
  const [detail, setDetail] = useState<InterestScreenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followedCount, setFollowedCount] = useState(0);
  const { state, loadMore } = useInterestPosts(interestId);

  useEffect(() => {
    let live = true;
    Promise.all([
      data.interests.get(interestId),
      data.interests.listChildren(interestId),
      data.session.me().catch(() => null),
    ])
      .then(([interest, children, me]) => {
        if (!live) return;
        setDetail({ interest, subInterests: children.items, rollsUpFrom: [] });
        setFollowedCount(me?.interestFollowCount ?? 0);
      })
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [data, interestId]);

  const toggleFollow = useCallback(
    (next: boolean) => {
      // Optimistic, then reconciled by the refusal path: the server enforces the
      // 200-interest cap (FR-034), so a rejection has to put the control back
      // rather than leave it showing a follow that did not happen.
      setDetail((d) => (d ? { ...d, interest: { ...d.interest, viewerIsFollowing: next } } : d));
      setFollowedCount((c) => c + (next ? 1 : -1));
      const call = next ? data.interests.follow(interestId) : data.interests.unfollow(interestId);
      void call.catch((e: unknown) => {
        setDetail((d) => (d ? { ...d, interest: { ...d.interest, viewerIsFollowing: !next } } : d));
        setFollowedCount((c) => c + (next ? -1 : 1));
        setError(e instanceof DataError ? e.message : String(e));
      });
    },
    [data, interestId],
  );

  if (error) return <Failed message={error} />;
  if (!detail) return <View testID="interest-loading" />;
  return (
    <InterestScreen
      data={detail}
      posts={state}
      followedCount={followedCount}
      onLoadMore={loadMore}
      onToggleFollow={toggleFollow}
      onOpenSubInterest={onOpenSubInterest}
      renderPost={(post) => <Text testID={`post-${post.postId}`}>{post.caption ?? ''}</Text>}
    />
  );
}

export function ProfileContainer({ handle, isSelf }: { handle: string; isSelf: boolean }) {
  const data = useData();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { state, loadMore } = useProfilePosts(handle);

  useEffect(() => {
    let live = true;
    data.session
      .me()
      .then((me) => {
        if (!live) return;
        setProfile({
          handle: me.handle,
          displayName: me.displayName,
          bio: me.bio ?? null,
          followerCount: me.followerCount ?? 0,
          followingCount: me.followingCount ?? 0,
          topInterests: me.topInterests ?? [],
          viewerIsFollowing: false,
        });
      })
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [data, handle]);

  if (error) return <Failed message={error} />;
  if (!profile) return <View testID="profile-loading" />;
  return (
    <ProfileScreen
      profile={profile}
      posts={state}
      viewerFollowsAnyOfTheirInterests={false}
      isSelf={isSelf}
      onToggleFollow={() => undefined}
      onLoadMore={loadMore}
      renderPost={(post) => <Text testID={`post-${post.postId}`}>{post.caption ?? ''}</Text>}
    />
  );
}

/**
 * Compose.
 *
 * `media` is supplied by the caller rather than picked here. There is no native
 * picker dependency in this build, and a journey that has to drive an OS gallery
 * dialog is the kind of device test that breaks for reasons unrelated to the
 * product. What the journey is actually about - choose an interest, upload,
 * publish, see it in the feed - runs end to end either way, over the real
 * presign/PUT/publish path.
 */
export function ComposeContainer({
  media,
  onPublished,
}: {
  media: PickedMedia[];
  onPublished: (postId: string) => void;
}) {
  const data = useData();
  const [slots, setSlots] = useState<UploadSlot[]>([]);
  const [options, setOptions] = useState<InterestRef[]>([]);
  const [selected, setSelected] = useState<InterestRef[]>([]);
  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(DEFAULT_VISIBILITY);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    data.interests
      .suggested()
      .then((page) => live && setOptions(page.items))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [data]);

  const upload = useCallback(
    (slot: UploadSlot) => {
      void runUpload(data.client, slot, (next) =>
        setSlots((all) => all.map((s) => (s.media.uri === next.media.uri ? next : s))),
      );
    },
    [data],
  );

  useEffect(() => {
    const fresh = media.map(newSlot);
    setSlots(fresh);
    fresh.forEach(upload);
  }, [media, upload]);

  const publish = useCallback(async () => {
    setPublishing(true);
    setError(null);
    try {
      const post = await data.posts.publish({
        uploadIds: slots.map((s) => s.uploadId).filter((id): id is string => Boolean(id)),
        interestIds: selected.map((i) => i.interestId),
        visibility,
        ...(caption ? { caption } : {}),
      });
      onPublished(post.postId);
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  }, [data, slots, selected, visibility, caption, onPublished]);

  return (
    <ComposeScreen
      media={media}
      slots={slots}
      interestOptions={options}
      selectedInterests={selected}
      caption={caption}
      visibility={visibility}
      publishing={publishing}
      error={error}
      onCaptionChange={setCaption}
      onInterestsChange={setSelected}
      onVisibilityChange={setVisibility}
      onRetry={upload}
      onPublish={() => void publish()}
    />
  );
}
