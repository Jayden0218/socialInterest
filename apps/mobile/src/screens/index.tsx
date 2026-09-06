import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { HomeFeedScreen } from '../features/feed/HomeFeedScreen';
import { InterestSearchScreen } from '../features/discover/InterestSearchScreen';
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { useHomeFeed, useInterestSearch, useNotifications, usePaged } from '../containers';
import { theme } from '../ui/theme';
import { Button, Row } from '../ui/primitives';

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
/**
 * A post in a list.
 *
 * Pressable, and that is the whole point: the feed used to render posts as bare
 * Text, so tapping one did nothing and post detail - with comments, report and
 * block behind it - was unreachable from every list in the app. The render tests
 * could not see it (they assert the caption is on screen, which it was) and
 * neither could the data-layer journeys (they never render). Only clicking it
 * in a browser did.
 */
function PostRow({ postId, caption, onOpen }: { postId: string; caption: string; onOpen: (id: string) => void }) {
  return (
    <Pressable testID={`post-${postId}`} onPress={() => onOpen(postId)}>
      <Text testID="post-caption">{caption}</Text>
    </Pressable>
  );
}

function Failed({ message }: { message: string }) {
  return (
    <View testID="load-error" style={{ padding: theme.space.md }}>
      <Text style={{ color: theme.color.danger }}>{message}</Text>
    </View>
  );
}

export function HomeFeedContainer({
  onEmptyAction,
  onOpenPost,
}: {
  onEmptyAction: () => void;
  onOpenPost: (postId: string) => void;
}) {
  const { state, error, loadMore } = useHomeFeed();
  if (error) return <Failed message={error} />;
  return (
    <HomeFeedScreen
      state={state}
      onLoadMore={loadMore}
      onEmptyAction={onEmptyAction}
      renderPost={(post) => (
        <PostRow postId={post.postId} caption={post.caption ?? ''} onOpen={onOpenPost} />
      )}
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

export function NotificationsContainer({ onOpen }: { onOpen: (postId: string) => void }) {
  const { state, error } = useNotifications();
  if (error) return <Failed message={error} />;
  return (
    <NotificationsScreen
      notifications={state.items}
      prefs={{ reaction: true, comment: true, follow: true }}
      // The notification's postId, not its notificationId. Passing the latter
      // opened a post route with a notification's id, and the API answered 404
      // "No longer available" - so every notification was a dead end. A follow
      // notification has no post at all (the field is nullable), and must not
      // navigate rather than navigate to nothing.
      onOpen={(n) => {
        if (n.postId) onOpen(n.postId);
      }}
      onEditPrefs={() => undefined}
    />
  );
}

/* --- post detail, comments, safety: the remaining screens, wired --- */

import { useCallback, useEffect } from 'react';
import type { Post } from '@sih/shared';
import { PostDetailScreen } from '../features/posts/PostDetailScreen';
import { EditPostScreen, type EditPostDraft } from '../features/posts/EditPostScreen';
import { SharedPostScreen } from '../features/posts/SharedPostScreen';
import { EditProfileScreen, type ProfileDraft } from '../features/profile/EditProfileScreen';
import { CommentsScreen } from '../features/engagement/CommentsScreen';
import { EngagementBar, type EngagementState } from '../features/engagement/EngagementBar';
import { SafetyActions, type ReportSubject } from '../features/safety/SafetyActions';
import { useData } from '../data-provider';
import { DataError } from '../data';

export function PostDetailContainer({
  postId,
  onOpenComments,
  onReport,
  onShare,
  onEdit,
  onOpenAuthor,
}: {
  postId: string;
  onOpenComments: (postId: string) => void;
  /**
   * The author's handle comes from here rather than from the caller, because
   * this is where the post is. Without it SafetyActions renders no Block
   * control at all (FR-044) - so blocking was unreachable on a device even
   * though the screen and the data call both existed.
   */
  onReport: (postId: string, authorHandle: string) => void;
  onShare: (postId: string) => void;
  onEdit: (postId: string) => void;
  /**
   * T053. Without a route here, ProfileContainer could only ever be reached
   * for your own profile from the "You" tab - so even a working follow control
   * had nothing to follow. This is the only place in the app where another
   * person is named.
   */
  onOpenAuthor?: (handle: string) => void;
}) {
  const data = useData();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engagement, setEngagement] = useState<EngagementState>({
    reactionCount: 0,
    commentCount: 0,
    viewerHasReacted: false,
  });
  // FR-012: only the author edits. The check is a convenience here - the server
  // refuses anyone else regardless - but showing the control to a person who
  // cannot use it is its own defect.
  const [isAuthor, setIsAuthor] = useState(false);

  useEffect(() => {
    let live = true;
    void data.session
      .me()
      .then((me) => live && post && setIsAuthor(me.userId === post.author.userId))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [data, post]);

  useEffect(() => {
    let live = true;
    data.posts
      .get(postId)
      .then((p) => {
        if (!live) return;
        setPost(p);
        setEngagement({
          reactionCount: p.reactionCount,
          commentCount: p.commentCount,
          viewerHasReacted: p.viewerHasReacted === true,
        });
      })
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [data, postId]);

  const react = useCallback(() => {
    if (!post) return;
    // Optimistic, reconciled by the failure path: the server owns the count and
    // react/unreact are idempotent (FR-039), so a double tap cannot inflate it.
    const next = !engagement.viewerHasReacted;
    setEngagement((e) => ({
      ...e,
      viewerHasReacted: next,
      reactionCount: e.reactionCount + (next ? 1 : -1),
    }));
    const call = next ? data.engagement.react(postId) : data.engagement.unreact(postId);
    void call.catch(() => {
      setEngagement((e) => ({
        ...e,
        viewerHasReacted: !next,
        reactionCount: e.reactionCount + (next ? -1 : 1),
      }));
    });
  }, [data, post, postId, engagement.viewerHasReacted]);

  if (error) return <Failed message={error} />;
  if (!post) return <View testID="post-loading" />;
  return (
    <View style={{ flex: 1 }}>
      <PostDetailScreen post={post} />
      {/* Reacting had no control anywhere in the app: EngagementBar existed,
          was render-tested, and was never mounted. FR-039 was unreachable. */}
      <EngagementBar
        state={engagement}
        onReact={react}
        onOpenComments={() => onOpenComments(postId)}
        onShare={() => onShare(postId)}
      />
      <Row style={{ padding: theme.space.sm, gap: theme.space.sm }}>
        {onOpenAuthor ? (
          <Button
            testID="open-author"
            label={`@${post.author.handle}`}
            variant="secondary"
            onPress={() => onOpenAuthor(post.author.handle)}
          />
        ) : null}
        <Button
          testID="open-safety"
          label="Report"
          variant="secondary"
          onPress={() => onReport(postId, post.author.handle)}
        />
        {isAuthor ? (
          <Button
            testID="open-edit-post"
            label="Edit"
            variant="secondary"
            onPress={() => onEdit(postId)}
          />
        ) : null}
      </Row>
    </View>
  );
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
import { ShareAction } from '../features/engagement/ShareAction';
import {
  CreateInterestScreen,
  stateForCandidates,
  SIMILARITY_CHECK_DEBOUNCE_MS,
  type CreateState,
} from '../features/discover/CreateInterestScreen';
import { ProfileScreen, type ProfileData } from '../features/profile/ProfileScreen';
import { ComposeScreen, newSlot, runUpload, type UploadSlot } from '../features/publish/ComposeScreen';
import { MediaPickerScreen, type PickedMedia } from '../features/publish/MediaPickerScreen';
import { useMediaLibrary } from '../features/publish/useMediaLibrary';
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
  onOpenPost,
}: {
  interestId: string;
  onOpenSubInterest: (id: string) => void;
  onOpenPost: (postId: string) => void;
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
      renderPost={(post) => (
        <PostRow postId={post.postId} caption={post.caption ?? ''} onOpen={onOpenPost} />
      )}
    />
  );
}

export function ProfileContainer({
  handle,
  isSelf,
  onOpenPost,
}: {
  handle: string;
  isSelf: boolean;
  onOpenPost: (postId: string) => void;
}) {
  const data = useData();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [myInterests, setMyInterests] = useState<string[]>([]);
  const { state, loadMore } = useProfilePosts(handle);

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
          bio: me.bio ?? null,
          followerCount: me.followerCount ?? 0,
          followingCount: me.followingCount ?? 0,
          topInterests: me.topInterests ?? [],
          // You do not follow yourself, and ProfileScreen hides the control
          // when isSelf anyway.
          viewerIsFollowing: false,
        }))
      : data.people.get(handle).then((p) => ({
          handle: p.handle,
          displayName: p.displayName,
          bio: p.bio ?? null,
          followerCount: p.followerCount ?? 0,
          followingCount: p.followingCount ?? 0,
          topInterests: p.topInterests ?? [],
          // The SERVER's answer, computed per viewer. A client-side guess here
          // would show the wrong state to anyone who followed from elsewhere.
          viewerIsFollowing: p.viewerIsFollowing === true,
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
      setProfile((p) => (p ? { ...p, viewerIsFollowing: next } : p));
      try {
        if (next) await data.people.follow(profile.handle);
        else await data.people.unfollow(profile.handle);
        const fresh = await data.people.get(profile.handle);
        setProfile((p) => (p ? { ...p, viewerIsFollowing: fresh.viewerIsFollowing === true,
          followerCount: fresh.followerCount ?? p.followerCount } : p));
      } catch (e: unknown) {
        setProfile((p) => (p ? { ...p, viewerIsFollowing: !next } : p));
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
      viewerFollowsAnyOfTheirInterests={profile.topInterests.some((i) =>
        myInterests.includes(i.interestId),
      )}
      isSelf={isSelf}
      followPending={pending}
      onToggleFollow={(next) => void toggleFollow(next)}
      onLoadMore={loadMore}
      renderPost={(post) => (
        <PostRow postId={post.postId} caption={post.caption ?? ''} onOpen={onOpenPost} />
      )}
    />
  );
}

/**
 * T038. The compose flow, starting where a person starts it: at their own media.
 *
 * `MediaPickerScreen` existed and nothing reached it - it was the last screen in
 * the app with no route to it, and compose took a bundled sample image instead.
 * So the first step of the core act was faked, and every publish journey began
 * one step in.
 *
 * The picker is now the first step, and the sample media remains the fallback
 * (T039): the browser journeys run this same code through react-native-web,
 * where there is no native gallery, and publish must still work end to end for
 * them. A refused permission is neither - it is explained, per FR-012.
 */
export function ComposeFlowContainer({ onPublished }: { onPublished: (postId: string) => void }) {
  const library = useMediaLibrary();
  const [selected, setSelected] = useState<PickedMedia[]>([]);
  const [picked, setPicked] = useState<PickedMedia[] | null>(null);

  if (picked) return <ComposeContainer media={picked} onPublished={onPublished} />;

  return (
    <MediaPickerScreen
      available={library.available}
      selected={selected}
      onChange={setSelected}
      onContinue={() => setPicked(selected)}
      libraryStatus={library.status}
      onOpenLibrary={() => void library.pick()}
    />
  );
}

/**
 * Compose itself, once media has been chosen.
 *
 * `media` is still a prop rather than picked here, so this stays drivable from a
 * test with a fixed set - which is what the browser journeys and the unit tests
 * both need.
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


/**
 * Share a post.
 *
 * ShareAction existed, carried the FR-041/FR-042 warning that a link grants
 * nothing, and was never mounted - so sharing was unreachable and the warning
 * was never shown to anyone.
 */
export function ShareContainer({ postId, onDone }: { postId: string; onDone: () => void }) {
  const data = useData();
  const [post, setPost] = useState<Post | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    data.posts
      .get(postId)
      .then(async (p) => {
        if (!live) return;
        setPost(p);
        const link = await data.posts.shareLink(postId);
        if (live) setUrl(link.url);
      })
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [data, postId]);

  if (error) return <Failed message={error} />;
  if (!post || url === null) return <View testID="share-loading" />;
  return (
    <ShareAction
      visibility={post.visibility}
      url={url}
      onCopy={onDone}
      onShare={onDone}
    />
  );
}

/**
 * Propose a sub-interest (FR-030, FR-031).
 *
 * CreateInterestScreen was written, tested, and unreachable. The name policy it
 * surfaces - a rejected name, or a near-duplicate offered to join instead - had
 * no way of ever being seen by a person.
 */
export function CreateInterestContainer({
  parentId,
  parentName,
  onCreated,
}: {
  parentId: string;
  parentName: string;
  onCreated: (interestId: string) => void;
}) {
  const data = useData();
  const [name, setName] = useState('');
  const [state, setState] = useState<CreateState>({ kind: 'editing' });

  // FR-031: near-duplicates are surfaced BEFORE submitting, and a name too
  // similar to an existing interest blocks rather than warns. The server is the
  // authority; this asks it as the person types, debounced.
  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setState({ kind: 'editing' });
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      void data.interests
        .search(trimmed)
        .then((page) => {
          if (!live) return;
          setState(
            stateForCandidates(
              page.items.map((interest) => ({
                interest,
                similarity: interest.name.toLowerCase() === trimmed.toLowerCase() ? 1 : 0.5,
              })),
            ),
          );
        })
        .catch(() => undefined);
    }, SIMILARITY_CHECK_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [data, name]);

  const submit = useCallback(async () => {
    setState({ kind: 'submitting' });
    try {
      const created = await data.interests.create({ name: name.trim(), parentId });
      onCreated(created.interestId);
    } catch (e: unknown) {
      setState({
        kind: 'rejected',
        title: e instanceof DataError ? e.message : String(e),
      });
    }
  }, [data, name, parentId, onCreated]);

  return (
    <CreateInterestScreen
      name={name}
      parentName={parentName}
      state={state}
      onNameChange={setName}
      onSubmit={() => void submit()}
      onJoinExisting={onCreated}
    />
  );
}


/**
 * Edit or delete your own post (FR-011, FR-012).
 *
 * EditPostScreen was written and render-tested and never mounted, so a person
 * could publish a post and then never change or remove it - including narrowing
 * its visibility, which is the one edit FR-017 says must take effect everywhere
 * immediately.
 */
export function EditPostContainer({
  postId,
  onDone,
}: {
  postId: string;
  onDone: () => void;
}) {
  const data = useData();
  const [original, setOriginal] = useState<EditPostDraft | null>(null);
  const [draft, setDraft] = useState<EditPostDraft | null>(null);
  const [options, setOptions] = useState<InterestRef[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    Promise.all([data.posts.get(postId), data.interests.suggested().catch(() => null)])
      .then(([post, suggested]) => {
        if (!live) return;
        const d: EditPostDraft = {
          caption: post.caption ?? '',
          interests: post.interests,
          visibility: post.visibility,
        };
        setOriginal(d);
        setDraft(d);
        setOptions(suggested ? suggested.items : post.interests);
      })
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [data, postId]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await data.posts.update(postId, {
        caption: draft.caption,
        interestIds: draft.interests.map((i) => i.interestId),
        visibility: draft.visibility,
      });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [data, draft, postId, onDone]);

  const remove = useCallback(async () => {
    setSaving(true);
    try {
      await data.posts.remove(postId);
      onDone();
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
      setSaving(false);
    }
  }, [data, postId, onDone]);

  if (error) return <Failed message={error} />;
  if (!draft || !original) return <View testID="edit-post-loading" />;
  return (
    <EditPostScreen
      draft={draft}
      original={original}
      interestOptions={options}
      saving={saving}
      onChange={setDraft}
      onSave={() => void save()}
      onDelete={() => void remove()}
    />
  );
}

/**
 * Edit your profile and notification preferences (FR-002, FR-049), and delete
 * your account (FR-048).
 *
 * Also never mounted. The preferences half could not have worked even if it had
 * been: the data layer's updateProfile did not accept notificationPrefs until
 * this change, so a toggle had nowhere to go.
 */
export function EditProfileContainer({ onDone }: { onDone: () => void }) {
  const data = useData();
  const [draft, setDraft] = useState<ProfileDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    data.session
      .me()
      .then((me) => {
        if (!live) return;
        setDraft({
          displayName: me.displayName,
          bio: me.bio ?? '',
          notificationPrefs: me.notificationPrefs,
        });
      })
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [data]);

  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      await data.session.updateProfile({
        displayName: draft.displayName,
        bio: draft.bio,
        notificationPrefs: draft.notificationPrefs,
      });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [data, draft, onDone]);

  const deleteAccount = useCallback(async () => {
    setSaving(true);
    try {
      await data.session.deleteAccount();
      onDone();
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
      setSaving(false);
    }
  }, [data, onDone]);

  if (error) return <Failed message={error} />;
  if (!draft) return <View testID="edit-profile-loading" />;
  return (
    <EditProfileScreen
      draft={draft}
      saving={saving}
      onChange={setDraft}
      onSave={() => void save()}
      onDeleteAccount={() => void deleteAccount()}
    />
  );
}

/**
 * The screen someone lands on from a share link (FR-042).
 *
 * A share link grants nothing: resolution re-checks visibility every time, so
 * the same URL can open for one person and not another, and can stop opening
 * after the author narrows the post. That is exactly what this screen exists to
 * say - and it had no way of ever being reached, because the app had no concept
 * of being opened at a post.
 *
 * `status` is the HTTP status the resolution produced, so the screen can tell
 * "not for you" from "no longer there" rather than collapsing both into an
 * error (FR-042).
 */
export function SharedPostContainer({ postId, onJoin }: { postId: string; onJoin: () => void }) {
  const data = useData();
  const [status, setStatus] = useState<number | null>(null);
  const [post, setPost] = useState<Post | null>(null);

  useEffect(() => {
    let live = true;
    data.posts
      .get(postId)
      .then((p) => {
        if (!live) return;
        setPost(p);
        setStatus(200);
      })
      .catch((e: unknown) => {
        if (!live) return;
        setStatus(e instanceof DataError ? e.status : 0);
      });
    return () => {
      live = false;
    };
  }, [data, postId]);

  if (status === null) return <View testID="shared-post-loading" />;
  return <SharedPostScreen status={status} {...(post ? { post } : {})} onJoin={onJoin} />;
}
