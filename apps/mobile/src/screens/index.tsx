import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Share, Text, View } from 'react-native';
import { HomeFeedScreen } from '../features/feed/HomeFeedScreen';
import { InterestSearchScreen, type SearchMode } from '../features/discover/InterestSearchScreen';
import { PostSearchResults } from '../features/discover/PostSearchResults';
import { NotificationsScreen } from '../features/notifications/NotificationsScreen';
import { PostCard, PostTile } from '../components/PostCard';
import { completeMention, trailingMention } from '../components/MentionSuggest';
import { InboxScreen } from '../features/conversations/InboxScreen';
import { ConversationScreen } from '../features/conversations/ConversationScreen';
import { NewGroupScreen } from '../features/conversations/NewGroupScreen';
import { PlaceScreen } from '../features/places/PlaceScreen';
import { CreatePlaceScreen } from '../features/places/CreatePlaceScreen';
import { SavedScreen } from '../features/profile/SavedScreen';
import { PlacePicker } from '../features/places/PlacePicker';
import type {
  PublicProfile,
  Conversation,
  ConversationState,
  ConversationSummary,
  Message,
  Place,
  PlaceCategory,
  PlaceSummary,
  Review,
} from '@sih/shared';
import {
  useFollowingFeed,
  useHomeFeed,
  useInterestSearch,
  useMarkNotificationsRead,
  useNotifications,
  usePaged,
  usePostSearch,
} from '../containers';
import { useDwell } from '../features/feed/useDwell';
import { activePalette as palette, space } from '../ui/theme';
import { Button, Row } from '../ui/primitives';
import { conversationTitle } from '../features/conversations/conversation-title';

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
    <View testID="load-error" style={{ padding: space.md }}>
      <Text style={{ color: palette.intent.danger }}>{message}</Text>
    </View>
  );
}

export function HomeFeedContainer({
  onEmptyAction,
  onOpenPost,
  onOpenInterest,
}: {
  onEmptyAction: () => void;
  onOpenPost: (postId: string) => void;
  /** 007/FR-017. One tap from a card to the interest's space. */
  onOpenInterest?: (interestId: string) => void;
}) {
  const data = useData();
  /**
   * 007/FR-004. Declared BEFORE the early return below, because a hook after
   * any return is the "Rendered more hooks than during the previous render"
   * crash - guarded by `hooks-before-return.test.ts`, which exists because this
   * exact mistake has been made here before.
   */
  const dwell = useDwell(data.signals);
  const [tab, setTab] = useState<'for-you' | 'following'>('for-you');
  const ranked = useHomeFeed();
  const following = useFollowingFeed();
  const active = tab === 'for-you' ? ranked : following;
  if (active.error) return <Failed message={active.error} />;
  return (
    <HomeFeedScreen
      state={active.state}
      onLoadMore={active.loadMore}
      onEmptyAction={onEmptyAction}
      tab={tab}
      onSelectTab={setTab}
      /**
       * 008/FR-009 — THE DWELL HOOK IS ATTACHED TO THE RANKED TAB ONLY.
       *
       * FR-009 is a CLIENT obligation as well as a server one. The server
       * records nothing on `GET /feed/following`, but dwell is measured on the
       * device and posted to `/v1/signals` separately - so leaving this wired
       * while Following was showing would train the ranked feed from the surface
       * a person chose in order to avoid it. The structural guard on the server
       * cannot see this; only this line and its journey can.
       */
      {...(tab === 'for-you' ? { onViewableChanged: dwell.onViewableChanged } : {})}
      renderPost={(post) => (
        <PostCard
          post={post}
          onOpenInterest={onOpenInterest}
          onOpen={(postId) => {
            /**
             * FR-010: this records that the post was opened. It does NOT show
             * the person why it was ranked where it was - no browse or post
             * surface may. The disclosure lives in Settings and nowhere else.
             *
             * 008/FR-009: not on the Following tab, for the reason above.
             */
            if (tab === 'for-you') dwell.record({ kind: 'open', postId });
            onOpenPost(postId);
          }}
        />
      )}
    />
  );
}

export function DiscoverContainer({
  onSelect,
  onSelectPlace,
  onSelectPerson,
  onOpenPost,
}: {
  onSelect: (interestId: string) => void;
  /** 004/US2. Places live inside Discover rather than taking a sixth tab. */
  onSelectPlace?: (placeId: string) => void;
  /** 004/FR-034. So do people. */
  onSelectPerson?: (handle: string) => void;
  /** 008/US6. Absent means the Posts tab is not offered at all. */
  onOpenPost?: (postId: string) => void;
}) {
  const data = useData();
  const [query, setQuery] = useState('');
  const [locality, setLocality] = useState('');
  const [places, setPlaces] = useState<PlaceSummary[]>([]);
  const [people, setPeople] = useState<PublicProfile[]>([]);
  const [mode, setMode] = useState<SearchMode>('interests');
  const [postMeta, setPostMeta] = useState<{
    terms: string[];
    fallback: { interests: InterestRef[]; people: PublicProfile[] } | null;
  }>({ terms: [], fallback: null });
  const { state, error } = useInterestSearch(query);
  const postSearch = usePostSearch(query, mode === 'posts' && onOpenPost !== undefined, (page) =>
    setPostMeta({ terms: page.meta?.terms ?? [], fallback: page.fallback ?? null }),
  );

  useEffect(() => {
    if (!onSelectPerson || query.trim().length === 0) {
      setPeople([]);
      return;
    }
    let live = true;
    // Swallowed on failure, like the place lookup: neither may take the
    // interest search - the product's primary navigation - down with it.
    void data.people
      .search(query, { limit: 5 })
      .then((r) => live && setPeople(r.items))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [data, query, onSelectPerson]);

  useEffect(() => {
    if (!onSelectPlace || query.trim().length === 0 || locality.trim().length === 0) {
      setPlaces([]);
      return;
    }
    let live = true;
    // Swallowed on failure: a place lookup that is down must not take the
    // interest search - the product's primary navigation - down with it.
    void data.places
      .search(query, { locality, limit: 5 })
      .then((r) => live && setPlaces(r.items))
      .catch(() => live && setPlaces([]));
    return () => {
      live = false;
    };
  }, [data, query, locality, onSelectPlace]);

  if (error) return <Failed message={error} />;
  return (
    <InterestSearchScreen
      query={query}
      results={state.items}
      places={places}
      people={people}
      locality={locality}
      mode={mode}
      onQueryChange={setQuery}
      {...(onSelectPlace ? { onLocalityChange: setLocality, onSelectPlace } : {})}
      {...(onSelectPerson ? { onSelectPerson } : {})}
      {...(onOpenPost
        ? {
            onSelectMode: setMode,
            posts: (
              <PostSearchResults
                query={query}
                state={postSearch.state}
                terms={postMeta.terms}
                fallback={postMeta.fallback}
                onLoadMore={postSearch.loadMore}
                onOpenPost={onOpenPost}
                onOpenInterest={onSelect}
                {...(onSelectPerson ? { onOpenPerson: onSelectPerson } : {})}
              />
            ),
          }
        : {})}
      onSelect={onSelect}
    />
  );
}

export function NotificationsContainer({ onOpen }: { onOpen: (postId: string) => void }) {
  const { state, error } = useNotifications();
  /**
   * 008/FR-005. Viewing marks them read.
   *
   * Declared BEFORE any return, which `__tests__/hooks-before-return.test.ts`
   * fails the build over: a hook after the early `error` return below is
   * "Rendered more hooks than during the previous render" the first time a load
   * fails.
   */
  useMarkNotificationsRead(state.items.length > 0);
  if (error) return <Failed message={error} />;
  return (
    <NotificationsScreen
      notifications={state.items}
      prefs={{ reaction: true, comment: true, follow: true, message: true, mention: true }}
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

import type { Comment, Interest, Post } from '@sih/shared';
import { PostDetailScreen } from '../features/posts/PostDetailScreen';
import { EditPostScreen, type EditPostDraft } from '../features/posts/EditPostScreen';
import { SharedPostScreen } from '../features/posts/SharedPostScreen';
import { type FeedSignalSummary, EditProfileScreen, type ProfileDraft } from '../features/profile/EditProfileScreen';
import { PickInterestsScreen, MAX_PICKS } from '../features/onboarding/PickInterestsScreen';
import { CommentsScreen } from '../features/engagement/CommentsScreen';
import { EngagementBar, type EngagementState } from '../features/engagement/EngagementBar';
import { SafetyActions, type ReportSubject } from '../features/safety/SafetyActions';
import { useData } from '../data-provider';
import { DataError } from '../data';

export function PostDetailContainer({
  postId,
  onOpenComments,
  onOpenPlace,
  onReport,
  onShare,
  onEdit,
  onOpenAuthor,
  onOpenInterest,
}: {
  postId: string;
  onOpenComments: (postId: string) => void;
  /** 004/FR-023. */
  onOpenPlace?: (placeId: string) => void;
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
  /** 007/FR-017, gate G2. The interest space, one tap from the post. */
  onOpenInterest?: (interestId: string) => void;
}) {
  const data = useData();
  const [saved, setSaved] = useState(false);
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
        // 004/FR-037. From the SERVER's answer, not a local default - the react
        // control rendered unreacted on every load for a whole feature for
        // exactly this reason.
        setSaved(p.viewerHasSaved === true);
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

  /**
   * 004/FR-037. Optimistic, then reconciled against the server's refusal.
   *
   * Saving a post you cannot see is refused (404), so a failure has to put the
   * star back rather than leave it showing a save that did not happen.
   */
  const toggleSave = useCallback(async () => {
    const next = !saved;
    setSaved(next);
    try {
      await (next ? data.saved.save(postId) : data.saved.unsave(postId));
    } catch {
      setSaved(!next);
    }
  }, [data, postId, saved]);

  if (error) return <Failed message={error} />;
  if (!post) return <View testID="post-loading" />;

  return (
    <View style={{ flex: 1 }}>
      {/*
        008/FR-030. A mention opens the same person surface a byline does, so a
        reader cannot end up on two different screens for one person.
      */}
      <PostDetailScreen
        post={post}
        {...(onOpenPlace ? { onOpenPlace } : {})}
        {...(onOpenInterest ? { onOpenInterest } : {})}
        {...(onOpenAuthor ? { onOpenPerson: onOpenAuthor } : {})}
      />
      {/* Reacting had no control anywhere in the app: EngagementBar existed,
          was render-tested, and was never mounted. FR-039 was unreachable. */}
      <EngagementBar
        state={engagement}
        onReact={react}
        onOpenComments={() => onOpenComments(postId)}
        onShare={() => onShare(postId)}
        saved={saved}
        onToggleSave={() => void toggleSave()}
      />
      <Row style={{ padding: space.sm, gap: space.sm }}>
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

export function CommentsContainer({
  postId,
  onOpenPerson,
}: {
  postId: string;
  /** 008/FR-030. A mention in a comment opens that person's profile. */
  onOpenPerson?: (handle: string) => void;
}) {
  const data = useData();
  const { state, error, reload } = usePagedComments(postId);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState<number | undefined>(undefined);
  // 008/FR-023. Which comment the composer is answering, if any.
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  // 008/FR-027. Which of your own comments the composer is correcting, if any.
  const [editing, setEditing] = useState<Comment | null>(null);
  const [viewerId, setViewerId] = useState('');
  // 008/FR-030. The same autocomplete the caption composer has.
  const [mentionMatches, setMentionMatches] = useState<PublicProfile[]>([]);

  useEffect(() => {
    const partial = trailingMention(draft);
    if (!partial || partial.length < 2) {
      setMentionMatches([]);
      return;
    }
    let live = true;
    void data.people
      .search(partial, { limit: 5 })
      .then((page) => live && setMentionMatches(page.items))
      .catch(() => live && setMentionMatches([]));
    return () => {
      live = false;
    };
  }, [data, draft]);

  /**
   * 008/FR-029. Who is signed in, so the app can draw the controls that are
   * yours. Every hook is declared BEFORE any return —
   * `hooks-before-return.test.ts` fails the build otherwise, and 004 shipped a
   * save button whose handler was dead code for exactly that reason.
   */
  useEffect(() => {
    let live = true;
    void data.session
      .me()
      .then((me) => live && setViewerId(me.userId))
      // A failed identity read must not take the thread down: the controls are
      // simply not drawn, and the server refuses anything they would have sent.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [data]);

  const beginEdit = useCallback((comment: Comment | null) => {
    setEditing(comment);
    setReplyingTo(null);
    // The existing text, so a correction starts from what was said rather than
    // from an empty box the person has to retype.
    setDraft(comment?.body ?? '');
  }, []);

  const beginReply = useCallback((comment: Comment | null) => {
    setReplyingTo(comment);
    setEditing(null);
    setDraft('');
  }, []);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      if (editing) {
        await data.engagement.editComment(postId, editing.commentId, draft);
      } else {
        await data.engagement.comment(postId, draft, replyingTo?.commentId ?? null);
      }
      setDraft('');
      setReplyingTo(null);
      setEditing(null);
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
  }, [data, postId, draft, replyingTo, editing, reload]);

  const remove = useCallback(
    async (comment: Comment) => {
      try {
        await data.engagement.deleteComment(postId, comment.commentId);
        if (editing?.commentId === comment.commentId) {
          setEditing(null);
          setDraft('');
        }
        reload();
      } catch (err) {
        setStatus(err instanceof DataError ? err.status : 0);
      }
    },
    [data, postId, editing, reload],
  );

  if (error) return <Failed message={error} />;
  return (
    <CommentsScreen
      comments={state.items}
      draft={draft}
      submitting={submitting}
      replyingTo={replyingTo}
      editing={editing}
      viewerId={viewerId}
      {...(status !== undefined ? { status } : {})}
      onDraftChange={setDraft}
      onSubmit={() => void submit()}
      onReplyTo={beginReply}
      onEdit={beginEdit}
      onDelete={(comment) => void remove(comment)}
      mentionMatches={mentionMatches}
      onChooseMention={(handle) => setDraft((d) => completeMention(d, handle))}
      {...(onOpenPerson ? { onOpenPerson } : {})}
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

  /*
    008/FR-039, FR-041. Offered where the other per-person choices are.

    Mute needs a PERSON and dismissal needs a POST, so a report about an
    interest name gets neither — correct, because there is nobody to see less of
    and nothing to stop showing.
  */
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
      {...(authorHandle ? { onMute: () => void data.safety.mute(authorHandle).then(onDone) } : {})}
      {...(subject === 'post' ? { onDismiss: () => void data.safety.dismiss(subjectId).then(onDone) } : {})}
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
import { readMediaBytes } from '../features/publish/uploadFlow';
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
  onReportDescription,
}: {
  interestId: string;
  onOpenSubInterest: (id: string) => void;
  onOpenPost: (postId: string) => void;
  /** 004/FR-030. A description is content, so it is reportable. */
  onReportDescription?: (interestId: string) => void;
}) {
  const data = useData();
  const [detail, setDetail] = useState<InterestScreenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [followedCount, setFollowedCount] = useState(0);
  // 004/FR-027, FR-029. Debounced by usePaged's dependency change, which
  // restarts paging - see useInterestPosts.
  const [order, setOrder] = useState<'new' | 'top'>('new');
  const [query, setQuery] = useState('');
  const { state, loadMore } = useInterestPosts(interestId, { order, q: query });

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
      order={order}
      query={query}
      onLoadMore={loadMore}
      onToggleFollow={toggleFollow}
      onOpenSubInterest={onOpenSubInterest}
      onOrderChange={setOrder}
      onQueryChange={setQuery}
      {...(onReportDescription ? { onReportDescription: () => onReportDescription(interestId) } : {})}
      renderPost={(post) => (
        <PostCard post={post} onOpen={onOpenPost} />
      )}
    />
  );
}

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
  // 004/FR-015. Optional throughout - none of this blocks publishing.
  const [place, setPlace] = useState<PlaceSummary | null>(null);
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeLocality, setPlaceLocality] = useState('');
  const [placeMatches, setPlaceMatches] = useState<PlaceSummary[]>([]);
  // 008/FR-030. People matching the handle currently being typed.
  const [mentionMatches, setMentionMatches] = useState<PublicProfile[]>([]);
  /**
   * 008/FR-034. Descriptions, keyed by the media's own uri.
   *
   * By URI rather than by index: a failed upload can be retried and the slots
   * re-ordered around it, and a description that followed a POSITION would then
   * describe the wrong picture — the same class of mistake as a testID carrying
   * a global index, which cost run 48.
   */
  const [altTexts, setAltTexts] = useState<Record<string, string>>({});
  // 008/FR-037. The draft this compose session is editing, once saved.
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);

  /**
   * 008/FR-030. Searched only while a handle is being typed at the END.
   *
   * `trailingMention` returns null the moment the person moves past it, which
   * clears the list — a suggestion list that outlives the thing it suggests for
   * is a control that edits text behind the cursor.
   */
  useEffect(() => {
    const partial = trailingMention(caption);
    if (!partial || partial.length < 2) {
      setMentionMatches([]);
      return;
    }
    let live = true;
    void data.people
      .search(partial, { limit: 5 })
      // Swallowed: a people lookup that is down must never take publishing down
      // with it, which is the same rule the place lookup follows.
      .then((page) => live && setMentionMatches(page.items))
      .catch(() => live && setMentionMatches([]));
    return () => {
      live = false;
    };
  }, [data, caption]);

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

  /**
   * FR-014. Matches WHILE TYPING, not a rejection after submitting.
   *
   * A failed search is swallowed: an offline lookup must not stop somebody
   * publishing, because the place is optional and the post is not.
   */
  useEffect(() => {
    if (placeQuery.trim().length === 0 || placeLocality.trim().length === 0) {
      setPlaceMatches([]);
      return;
    }
    let live = true;
    void data.places
      .search(placeQuery, { locality: placeLocality, limit: 5 })
      .then((r) => live && setPlaceMatches(r.items))
      .catch(() => live && setPlaceMatches([]));
    return () => {
      live = false;
    };
  }, [data, placeQuery, placeLocality]);

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

  /**
   * Creating from inside compose, rather than sending the person to another
   * screen and losing their draft.
   *
   * A 409 attaches the existing place instead of failing - which is the whole
   * dedupe, expressed as behaviour rather than as a warning nobody reads.
   */
  const createPlaceInline = useCallback(async () => {
    try {
      setPlace(
        await data.places.create({
          name: placeQuery.trim(),
          category: 'restaurant',
          locality: placeLocality.trim(),
        }),
      );
    } catch (e: unknown) {
      const problem = e instanceof DataError ? (e.problem as unknown as PlaceSummary) : null;
      if (e instanceof DataError && e.status === 409 && problem?.placeId) {
        setPlace(problem);
      } else {
        setError(e instanceof DataError ? e.message : String(e));
      }
    }
  }, [data, placeQuery, placeLocality]);

  /**
   * 008/FR-037. Saves whatever is here, including nothing much.
   *
   * The same `draftId` is reused on a second save, so a person pressing Save
   * twice has ONE unfinished post rather than a list of near-identical ones —
   * which is what a create-only endpoint would have produced.
   */
  const saveDraft = useCallback(async () => {
    try {
      const saved = await data.drafts.save({
        ...(draftId ? { draftId } : {}),
        ...(caption ? { caption } : {}),
        interestIds: selected.map((i) => i.interestId),
        ...(place ? { placeId: place.placeId } : {}),
        uploadIds: slots.map((s) => s.uploadId).filter((id): id is string => Boolean(id)),
        altTexts: Object.fromEntries(
          slots
            .filter((s) => s.uploadId && (altTexts[s.media.uri] ?? '').trim().length > 0)
            .map((s) => [s.uploadId as string, (altTexts[s.media.uri] as string).trim()]),
        ),
      });
      setDraftId(saved.draftId);
      setDraftSaved(true);
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    }
  }, [data, draftId, caption, selected, place, slots, altTexts]);

  const publish = useCallback(async () => {
    setPublishing(true);
    setError(null);
    try {
      const post = await data.posts.publish({
        uploadIds: slots.map((s) => s.uploadId).filter((id): id is string => Boolean(id)),
        // 008/FR-038. Publishing FROM this draft removes it in the same
        // transaction, so a person cannot be left with a duplicate to publish
        // a second time.
        ...(draftId ? { draftId } : {}),
        // Keyed by UPLOAD ID for the server, translated from uri here — the one
        // place that knows both.
        altTexts: Object.fromEntries(
          slots
            .filter((s) => s.uploadId && (altTexts[s.media.uri] ?? '').trim().length > 0)
            .map((s) => [s.uploadId as string, (altTexts[s.media.uri] as string).trim()]),
        ),
        interestIds: selected.map((i) => i.interestId),
        visibility,
        ...(caption ? { caption } : {}),
        // 004/FR-015. Absent unless the AUTHOR picked one. There is deliberately
        // no fallback that infers a place from anything.
        ...(place ? { placeId: place.placeId } : {}),
      });
      onPublished(post.postId);
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setPublishing(false);
    }
  }, [data, slots, selected, visibility, caption, place, altTexts, draftId, onPublished]);

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
      mentionMatches={mentionMatches}
      onChooseMention={(handle) => setCaption((c) => completeMention(c, handle))}
      altTexts={altTexts}
      onAltTextChange={(uri, text) => setAltTexts((prev) => ({ ...prev, [uri]: text }))}
      draftSaved={draftSaved}
      onSaveDraft={() => void saveDraft()}
      onInterestsChange={setSelected}
      onVisibilityChange={setVisibility}
      onRetry={upload}
      onPublish={() => void publish()}
      placePicker={
        <PlacePicker
          query={placeQuery}
          locality={placeLocality}
          matches={placeMatches}
          selected={place}
          onQueryChange={setPlaceQuery}
          onLocalityChange={setPlaceLocality}
          onSelect={setPlace}
          onCreate={() => void createPlaceInline()}
        />
      }
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
  const [conversations, setConversations] = useState<
    { conversationId: string; displayName: string }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [personQuery, setPersonQuery] = useState('');
  const [people, setPeople] = useState<PublicProfile[]>([]);
  const [sendError, setSendError] = useState<string | null>(null);

  /**
   * 008/FR-011. People matching the query, for the recipient picker.
   *
   * A short query returns nothing rather than everybody: `A34` puts every person
   * in ONE partition sorted by handle, which `keys.ts` records as the honest
   * limit of that design, and a one-letter prefix would walk most of it.
   */
  useEffect(() => {
    const q = personQuery.trim();
    if (q.length < 2) {
      setPeople([]);
      return;
    }
    let live = true;
    void data.people
      .search(q, { limit: 5 })
      .then((page) => live && setPeople(page.items))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [data, personQuery]);

  useEffect(() => {
    let live = true;
    data.posts
      .get(postId)
      .then(async (p) => {
        if (!live) return;
        setPost(p);
        const link = await data.posts.shareLink(postId);
        if (live) setUrl(link.url);
        // 004/FR-009. Accepted conversations only - sending a post into a
        // REQUEST would deliver content to somebody who has not agreed to hear
        // from you, which is the thing the request inbox exists to prevent.
        const inbox = await data.conversations.list({ state: 'accepted', limit: 10 });
        if (live) {
          setConversations(
            inbox.items.map((c) => ({
              conversationId: c.conversationId,
              displayName: conversationTitle(c),
            })),
          );
        }
      })
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [data, postId]);

  const sendToConversation = useCallback(
    async (conversationId: string) => {
      await data.conversations.send(conversationId, { sharedPostId: postId });
      onDone();
    },
    [data, postId, onDone],
  );

  /**
   * 008/FR-011 — SEND TO SOMEBODY THERE IS NO CONVERSATION WITH YET.
   *
   * Two existing calls, no new endpoint: `open` derives the pair id and creates
   * the conversation as a REQUEST when the two have never spoken (FR-012), and
   * `send` carries the post reference. A dedicated send endpoint would be a
   * second way to write a message needing its own access check, which is the
   * two-predicates failure in a new place.
   */
  const sendToPerson = useCallback(
    async (handle: string) => {
      try {
        const conversation = await data.conversations.open(handle);
        await data.conversations.send(conversation.conversationId, { sharedPostId: postId });
        onDone();
      } catch {
        /**
         * 008/FR-014 — ONE NEUTRAL MESSAGE FOR EVERY REFUSAL.
         *
         * A block must not be distinguishable from any other reason this could
         * fail. Reporting the server's own text here would leak exactly what the
         * server took care to hide by answering `gone` rather than `not-for-you`.
         */
        setSendError('This post could not be sent to that person.');
      }
    },
    [data, postId, onDone],
  );

  /**
   * 008/FR-015 — THE PLATFORM SHARE MECHANISM, not `onDone`.
   *
   * `share-send` closed the sheet and did nothing else, so the app's Share
   * button has never shared anything anywhere. The link itself is unchanged and
   * still confers no access of its own (001/FR-042); this only hands it to the
   * place a person expects it to go.
   */
  const shareOutside = useCallback(async () => {
    try {
      await Share.share({ message: url ?? '' });
    } catch {
      // A dismissed share sheet rejects on some platforms. Nothing has gone
      // wrong and there is nothing to tell anyone.
    }
    onDone();
  }, [url, onDone]);

  if (error) return <Failed message={error} />;
  if (!post || url === null) return <View testID="share-loading" />;
  return (
    <ShareAction
      visibility={post.visibility}
      url={url}
      conversations={conversations}
      onCopy={onDone}
      onShare={() => void shareOutside()}
      onSendToConversation={(id) => void sendToConversation(id)}
      onSearchPeople={(q) => setPersonQuery(q)}
      people={people}
      onSendToPerson={(handle) => void sendToPerson(handle)}
      sendError={sendError}
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
  // 007/FR-011, FR-012.
  const [feedSignals, setFeedSignals] = useState<FeedSignalSummary | null>(null);
  const [clearingSignals, setClearingSignals] = useState(false);
  // 008/FR-017. Declared BEFORE any return, like every hook in this file -
  // `hooks-before-return.test.ts` fails the build otherwise.
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const library = useMediaLibrary();
  /**
   * 008/T086, after emulator run 50 — THE PICKER IS THE APP'S OWN.
   *
   * This used to call `library.pick()` directly, which on a device opens the
   * SYSTEM gallery: a modal owned by `com.android.documentsui` that nothing in
   * the app or the flow can dismiss. Run 50's `27-set-avatar` waited 120 seconds
   * for a photo to appear and the whole-run aggregate shows 12 uploads for 10
   * posts — exactly the media those posts needed and not one byte more, so no
   * avatar upload was ever attempted.
   *
   * Compose has never had that problem, because it does not hand off blind: it
   * shows `MediaPickerScreen` — the app's own list, with the device library
   * behind an explicit control (`10-publish-from-library` verifies that
   * hand-off and deliberately does not drive Google's UI). Setting a picture now
   * takes the same route, which is both the consistent product and the one a
   * device run can drive.
   */
  const [pickingAvatar, setPickingAvatar] = useState(false);
  const [avatarChoice, setAvatarChoice] = useState<PickedMedia[]>([]);
  // 008/FR-043. The queue the privacy toggle creates, on the screen that
  // creates it — see the note on `EditProfileScreen`'s `followRequests` prop.
  const [followRequests, setFollowRequests] = useState<PublicProfile[]>([]);

  useEffect(() => {
    let live = true;
    /**
     * Read alongside the profile rather than behind a tap. FR-011 says a person
     * must be able to SEE what their feed is built from; a disclosure hidden
     * behind another navigation step is one SC-003 gives them thirty seconds to
     * find, from the app's main screen, without guidance.
     */
    data.signals
      .disclosure()
      .then((d) => live && setFeedSignals({ interests: d.interests, collected: d.collected }))
      // A failed disclosure hides the group; it must never block editing a name.
      .catch(() => undefined);
    data.session
      .me()
      .then((me) => {
        if (!live) return;
        setDraft({
          userId: me.userId,
          displayName: me.displayName,
          bio: me.bio ?? '',
          notificationPrefs: me.notificationPrefs,
          // Absent means `open`, exactly as it does on the stored row.
          accountPrivacy: me.accountPrivacy ?? 'open',
        });
        setAvatarUrl(me.avatarUrl ?? null);
      })
      .catch((e: unknown) => live && setError(e instanceof DataError ? e.message : String(e)))
      /**
       * 008/FR-043. LAST, and swallowing its own failures.
       *
       * Ordered after the profile deliberately: an empty or failed request list
       * must never stop somebody editing their name. The first version ran it
       * first and a container test with an incomplete data stub took the whole
       * effect down with it — which is the production failure mode too, just
       * with a different cause.
       */
      .then(() => data.people.followRequests())
      .then((page) => live && setFollowRequests(page.items))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [data]);

  /**
   * 008/FR-017, FR-018 — SET A PROFILE PICTURE.
   *
   * The SAME presign/PUT/quote path as any other image: `createUploadTarget`
   * with kind `avatar`, PUT the bytes, then send the UPLOAD ID. The server reads
   * the key from the record it issued, because 002's second defect was a
   * client-supplied key letting a post point at another person's media.
   *
   * The library is the same one compose uses. `expo install`-provisioned only —
   * `pnpm add` once took `expo-image-picker@57` against SDK 54 and killed the
   * app during module registration with `NoClassDefFoundError: AnyTypeCache`.
   */
  const uploadAvatar = useCallback(async (picked: PickedMedia) => {
    setAvatarBusy(true);
    try {
      const bytes = await readMediaBytes(picked.uri, fetch);
      /**
       * `readMediaBytes` returns `Uint8Array | Blob` - a data: URI decodes to
       * the first, a device file: URI fetches to the second - and only the Blob
       * lacks `byteLength`. `size` is its equivalent.
       *
       * The declared size is what the app TELLS the server when asking for an
       * upload target, and 006 shipped a sample declaring 68 for 70 bytes, so
       * the app announced one length and uploaded another.
       */
      const sizeBytes = bytes instanceof Uint8Array ? bytes.byteLength : bytes.size;
      const target = await data.posts.createUploadTarget({
        kind: 'avatar',
        contentType: picked.contentType,
        sizeBytes,
      });
      // Same cast and same reason as `uploadFlow.ts:128`: `fetch` accepts both,
      // and widening the data layer's signature to `any` would be worse.
      await data.posts.uploadBytes(target, bytes as unknown as Uint8Array, picked.contentType);
      const me = await data.session.updateProfile({ avatarUploadId: target.uploadId });
      setAvatarUrl(me.avatarUrl ?? null);
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setAvatarBusy(false);
    }
  }, [data]);

  /** FR-017. `null` REMOVES it; absent would leave it alone. */
  const removeAvatar = useCallback(async () => {
    setAvatarBusy(true);
    try {
      const me = await data.session.updateProfile({ avatarUploadId: null });
      setAvatarUrl(me.avatarUrl ?? null);
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setAvatarBusy(false);
    }
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
        // 008/FR-043. Saved with everything else, so the screen has one contract.
        accountPrivacy: draft.accountPrivacy,
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

  /**
   * 008/FR-043. Approve or decline, then RE-READ.
   *
   * Removing the row locally would be the obvious optimisation and would make
   * the list disagree with the server the moment a request arrives during the
   * tap. The list is small by construction — it is bounded by the people who
   * asked — so re-reading it costs one request and cannot drift.
   */
  const answerFollowRequest = useCallback(
    async (handle: string, action: 'approve' | 'decline') => {
      try {
        if (action === 'approve') await data.people.approveFollowRequest(handle);
        else await data.people.declineFollowRequest(handle);
        setFollowRequests((await data.people.followRequests()).items);
      } catch (e: unknown) {
        setError(e instanceof DataError ? e.message : String(e));
      }
    },
    [data],
  );

  const clearFeedSignals = useCallback(async () => {
    setClearingSignals(true);
    try {
      await data.signals.clear();
      /**
       * RE-READ rather than assuming an empty result. What survives a clear is
       * the person's own declarations - their seed picks and followed interests
       * - so "cleared" does not mean "empty", and a screen that assumed it did
       * would tell them the reset failed.
       */
      const after = await data.signals.disclosure();
      setFeedSignals({ interests: after.interests, collected: after.collected });
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setClearingSignals(false);
    }
  }, [data]);

  if (error) return <Failed message={error} />;
  if (!draft) return <View testID="edit-profile-loading" />;
  if (pickingAvatar) {
    return (
      <MediaPickerScreen
        // Images only: a profile picture is one still. The picker's own rule
        // that a video is always a post on its own would otherwise let somebody
        // choose a clip here and be refused later by `media.limits.ts`.
        available={library.available.filter((m) => m.kind === 'image')}
        selected={avatarChoice}
        // ONE, always the most recent tap - `media-continue` is enabled by a
        // non-empty selection and an avatar is not a set.
        onChange={(next) => setAvatarChoice(next.slice(-1))}
        onContinue={() => {
          const chosen = avatarChoice[0];
          setPickingAvatar(false);
          setAvatarChoice([]);
          if (chosen) void uploadAvatar(chosen);
        }}
        libraryStatus={library.status}
        onOpenLibrary={() => void library.pick()}
      />
    );
  }
  return (
    <EditProfileScreen
      avatarUrl={avatarUrl}
      avatarBusy={avatarBusy}
      onChangeAvatar={() => setPickingAvatar(true)}
      onRemoveAvatar={() => void removeAvatar()}
      draft={draft}
      saving={saving}
      feedSignals={feedSignals}
      clearingSignals={clearingSignals}
      onChange={setDraft}
      onSave={() => void save()}
      onClearFeedSignals={() => void clearFeedSignals()}
      onDeleteAccount={() => void deleteAccount()}
      followRequests={followRequests.map((p) => ({
        userId: p.userId,
        handle: p.handle,
        displayName: p.displayName,
      }))}
      onApproveFollowRequest={(handle) => void answerFollowRequest(handle, 'approve')}
      onDeclineFollowRequest={(handle) => void answerFollowRequest(handle, 'decline')}
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

// ---------------------------------------------------------------- feature 004

/**
 * The inbox (FR-003, FR-010).
 *
 * Two inboxes, each its own request. Not one list filtered in the client: the
 * server partitions them, and a client-side filter would page wrongly - twenty
 * rows fetched, three shown.
 */
export function InboxContainer({
  onOpen,
  onNewGroup,
}: {
  onOpen: (conversationId: string, otherHandle: string | null) => void;
  /** 005/FR-018. Optional so a caller that has no route for it still compiles. */
  onNewGroup?: () => void;
}) {
  const data = useData();
  const [inbox, setInbox] = useState<ConversationState>('accepted');
  const [items, setItems] = useState<ConversationSummary[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (state: ConversationState) => {
      try {
        setItems((await data.conversations.list({ state, limit: 30 })).items);
        setError(null);
      } catch (err) {
        // Never an empty list for a failed load: "no messages yet" for a dropped
        // connection is the mistake this shape exists to prevent.
        setError(err instanceof DataError ? err.problem.title ?? 'Could not load messages' : 'Could not load messages');
      }
    },
    [data],
  );

  useEffect(() => {
    void load(inbox);
  }, [load, inbox]);

  /**
   * The Requests badge in `Chats.dc.html`, which is the whole reason that tab is
   * worth looking at: a request you have not seen is invisible from the
   * Messages tab otherwise.
   *
   * A SEPARATE read, because the list request returns one inbox and the badge is
   * about the other one. It runs once on mount rather than on every inbox
   * switch, and a failure is swallowed: a decoration that cannot load must not
   * turn into "Could not load messages" over a list that loaded fine.
   */
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const page = await data.conversations.list({ state: 'requested', limit: 30 });
        if (live) setRequestCount(page.items.length);
      } catch {
        if (live) setRequestCount(0);
      }
    })();
    return () => {
      live = false;
    };
  }, [data]);

  if (error) return <Failed message={error} />;
  return (
    <InboxScreen
      state={inbox}
      conversations={items}
      onSelectInbox={setInbox}
      onOpen={(c) => onOpen(c.conversationId, c.other?.handle ?? null)}
      requestCount={requestCount}
      {...(onNewGroup ? { onNewGroup } : {})}
    />
  );
}

/**
 * One conversation, with the long poll (FR-011).
 *
 * The loop re-issues as soon as each request settles, so there is exactly one
 * in flight at a time and delivery is sub-second. It stops on unmount - a
 * running poll after the screen is gone holds a connection nobody is reading.
 */
export function ConversationContainer({
  conversationId,
  onOpenPost,
  onReport,
  onLeft,
}: {
  conversationId: string;
  onOpenPost: (postId: string) => void;
  onReport: (subjectId: string) => void;
  /**
   * 005/FR-021. Where to go once leaving succeeds.
   *
   * Leaving makes the conversation a 404 to you, so the screen you are standing
   * on stops existing. Without somewhere to go, the poll's next request fails
   * and the screen renders its own refusal - which reads as an error rather than
   * as the thing you just asked for.
   */
  onLeft?: () => void;
}) {
  const data = useData();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [viewerId, setViewerId] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addHandle, setAddHandle] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const live = useRef(true);
  const cursor = useRef<string | undefined>(undefined);

  const refreshConversation = useCallback(async () => {
    try {
      setConversation(await data.conversations.get(conversationId));
    } catch (err) {
      setError(err instanceof DataError ? err.problem.title ?? 'Not found' : 'Not found');
    }
  }, [data, conversationId]);

  useEffect(() => {
    live.current = true;
    void data.session.me().then((me) => live.current && setViewerId(me.userId));
    void refreshConversation();

    const absorb = (page: { items: Message[] }): void => {
      if (page.items.length === 0) return;
      cursor.current = page.items[page.items.length - 1]!.messageId;
      setMessages((prev) => {
        const byId = new Map(prev.map((m) => [m.messageId, m]));
        // Replace rather than append: a message can CHANGE - a shared post stops
        // resolving, or moderation removes the body - and appending would keep
        // showing the version that was fetched first.
        for (const m of page.items) byId.set(m.messageId, m);
        return [...byId.values()].sort((a, b) => a.messageId.localeCompare(b.messageId));
      });
      void data.conversations
        .markRead(conversationId, page.items[page.items.length - 1]!.messageId)
        .catch(() => undefined);
    };

    void (async () => {
      try {
        absorb(await data.conversations.messages(conversationId, { limit: 50 }));
      } catch (err) {
        if (live.current) {
          setError(err instanceof DataError ? err.problem.title ?? 'Not found' : 'Not found');
        }
        return;
      }
      while (live.current) {
        try {
          absorb(
            await data.conversations.messages(conversationId, {
              ...(cursor.current ? { after: cursor.current } : {}),
              waitSeconds: 25,
            }),
          );
        } catch {
          // A failed poll must not spin. Back off, then carry on - the
          // conversation may simply have been severed while it was open.
          await new Promise((r) => setTimeout(r, 2000));
          if (live.current) await refreshConversation();
        }
      }
    })();

    return () => {
      live.current = false;
    };
  }, [data, conversationId, refreshConversation]);

  const send = useCallback(async () => {
    setSending(true);
    try {
      await data.conversations.send(conversationId, { body: draft });
      setDraft('');
      await refreshConversation();
    } catch (err) {
      setError(err instanceof DataError ? err.problem.title ?? 'Could not send' : 'Could not send');
    } finally {
      setSending(false);
    }
  }, [data, conversationId, draft, refreshConversation]);

  const respond = useCallback(
    async (decision: 'accept' | 'decline') => {
      await (decision === 'accept'
        ? data.conversations.accept(conversationId)
        : data.conversations.decline(conversationId));
      await refreshConversation();
    },
    [data, conversationId, refreshConversation],
  );

  const addParticipant = useCallback(async () => {
    const handle = addHandle.trim().replace(/^@/, '');
    if (!handle) return;
    try {
      await data.conversations.addParticipant(conversationId, handle);
      setAddHandle('');
      setAddError(null);
      // Re-read rather than appending locally: the server decides who is in the
      // group, and a client that painted the new member itself would show one
      // that the transaction had in fact refused.
      await refreshConversation();
    } catch (err) {
      setAddError(
        err instanceof DataError ? err.problem.title ?? 'Could not add them' : 'Could not add them',
      );
    }
  }, [data, conversationId, addHandle, refreshConversation]);

  const leave = useCallback(async () => {
    try {
      await data.conversations.leave(conversationId);
      // Stop the poll BEFORE handing over. It is now polling a conversation the
      // server refuses, and a request in flight would set an error on a screen
      // that is on its way out.
      live.current = false;
      onLeft?.();
    } catch (err) {
      setError(err instanceof DataError ? err.problem.title ?? 'Could not leave' : 'Could not leave');
    }
  }, [data, conversationId, onLeft]);

  if (error) return <Failed message={error} />;
  if (!conversation) return <Failed message="Loading…" />;
  return (
    <ConversationScreen
      conversation={conversation}
      messages={messages}
      viewerId={viewerId}
      draft={draft}
      sending={sending}
      onDraftChange={setDraft}
      onSend={() => void send()}
      onAccept={() => void respond('accept')}
      onDecline={() => void respond('decline')}
      onOpenPost={onOpenPost}
      // A message is reported as `<conversationId>:<messageId>` - a message id
      // alone does not locate a message, and the composite is the only form a
      // participant can produce.
      onReport={(messageId) => onReport(`${conversationId}:${messageId}`)}
      // Only a group can be left or added to, and `ConversationScreen` hides
      // both controls when these are absent - so a pair never offers them.
      {...(conversation.kind === 'group'
        ? {
            onLeave: () => void leave(),
            addHandle,
            addError,
            onAddHandleChange: setAddHandle,
            onAddParticipant: () => void addParticipant(),
          }
        : {})}
    />
  );
}

/**
 * Resolves a handle to a conversation, then hands over.
 *
 * `PUT /conversations/with/{handle}` is idempotent - the id is derived from the
 * participant pair - so this is safe to re-enter and never makes a second
 * thread. It REPLACES itself on the stack rather than pushing, so Back from the
 * conversation returns to the profile rather than to a screen that immediately
 * opens the conversation again.
 */
export function OpenConversationContainer({
  handle,
  onOpened,
}: {
  handle: string;
  onOpened: (conversationId: string, otherHandle: string | null) => void;
}) {
  const data = useData();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const conversation = await data.conversations.open(handle);
        if (live) onOpened(conversation.conversationId, conversation.other?.handle ?? null);
      } catch (err) {
        // 404 here means blocked OR no such person, deliberately - the block
        // must not be disclosed, so the copy cannot distinguish them either.
        if (live) {
          setError(
            err instanceof DataError && err.status === 404
              ? 'This person is not available.'
              : 'Could not open the conversation.',
          );
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [data, handle, onOpened]);

  return <Failed message={error ?? 'Opening…'} />;
}

/**
 * 005/FR-018, FR-027. Creating a group.
 *
 * EVERY HOOK ABOVE EVERY RETURN, per `__tests__/hooks-before-return.test.ts`.
 * A hook after the final return is dead code - that is how 004's save button
 * came to do nothing - and a hook after an EARLY return is "Rendered more hooks
 * than during the previous render".
 */
export function NewGroupContainer({
  onCreated,
}: {
  onCreated: (conversationId: string, otherHandle: string | null) => void;
}) {
  const data = useData();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [selected, setSelected] = useState<PublicProfile[]>([]);
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const q = query.trim();
    if (!q) {
      setResults([]);
      return () => {
        live = false;
      };
    }
    // Debounced, so typing a handle is one search rather than eight - and the
    // people-search endpoint is rate limited.
    const timer = setTimeout(() => {
      void data.people
        .search(q, { limit: 20 })
        .then((page) => live && setResults(page.items))
        .catch(() => live && setResults([]));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [data, query]);

  const toggle = useCallback((person: PublicProfile) => {
    setSelected((prev) =>
      prev.some((p) => p.handle === person.handle)
        ? prev.filter((p) => p.handle !== person.handle)
        : [...prev, person],
    );
  }, []);

  const create = useCallback(async () => {
    setCreating(true);
    try {
      const conversation = await data.conversations.createGroup({
        participantHandles: selected.map((p) => p.handle),
        name: name.trim() ? name.trim() : null,
      });
      /**
       * FR-027: one other person is a PAIR, and the server says so by returning
       * the derived-id conversation with `other` populated. Handing that
       * straight through means the caller navigates to the right thing without
       * a second rule here about which kind it got.
       */
      onCreated(conversation.conversationId, conversation.other?.handle ?? null);
    } catch (err) {
      /**
       * The SERVER's refusal, verbatim. FR-023 refuses a group containing a
       * blocking pair without naming who blocked whom, and SC-012 compares that
       * response against another "cannot add" refusal as literal responses. A
       * client that substituted its own friendlier copy here would be free to
       * disclose exactly what the wording was chosen to withhold.
       */
      setError(
        err instanceof DataError
          ? err.problem.title ?? 'Could not create the group'
          : 'Could not create the group',
      );
    } finally {
      setCreating(false);
    }
  }, [data, selected, name, onCreated]);

  return (
    <NewGroupScreen
      query={query}
      results={results}
      selected={selected}
      name={name}
      creating={creating}
      error={error}
      onQueryChange={setQuery}
      onToggle={toggle}
      onNameChange={setName}
      onCreate={() => void create()}
    />
  );
}

/** FR-016, FR-018. Surface 8 in the app. */
export function PlaceContainer({
  placeId,
  signedIn,
  onOpenPost,
  onReport,
}: {
  placeId: string;
  /**
   * 005/FR-006. Rating requires a caller; reading does not.
   *
   * Passed in rather than derived here. The app already knows, and asking
   * `session.me()` per place page would be a network call to answer a question
   * the navigator holds - and would render the control briefly for a signed-out
   * visitor while the answer was in flight.
   */
  signedIn?: boolean;
  onOpenPost: (postId: string) => void;
  onReport: (subjectId: string) => void;
}) {
  const data = useData();
  const [place, setPlace] = useState<Place | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const { state, loadMore } = usePaged(
    (cursor) => data.places.posts(placeId, cursor ? { cursor } : {}),
    [placeId],
  );

  const reload = useCallback(async () => {
    try {
      setPlace(await data.places.get(placeId));
    } catch (err) {
      setError(err instanceof DataError ? err.problem.title ?? 'No such place' : 'No such place');
    }
  }, [data, placeId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleFollow = useCallback(
    async (next: boolean) => {
      setPending(true);
      try {
        await (next ? data.places.follow(placeId) : data.places.unfollow(placeId));
        // Read back from the SERVER rather than flipping a local flag, so
        // "Following" means the follow was accepted.
        await reload();
      } finally {
        setPending(false);
      }
    },
    [data, placeId, reload],
  );

  /**
   * 005/US1, US2. EVERY HOOK ABOVE EVERY RETURN.
   *
   * `__tests__/hooks-before-return.test.ts` fails the build for a hook after ANY
   * return, and it exists because 004 shipped `toggleSave` declared below the
   * container's final return: dead code, a temporal dead zone, and a star that
   * did nothing - with typecheck, lint and fifty mobile tests all green, because
   * they render screens with props and never press a container's button.
   */
  const loadReviews = useCallback(async () => {
    try {
      setReviews((await data.places.reviews(placeId, { limit: 20 })).items);
    } catch {
      // A place page whose posts render is not broken because its reviews did
      // not. Left null, which renders nothing rather than an error over content
      // that loaded fine.
    }
  }, [data, placeId]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const rate = useCallback(
    async (score: number) => {
      setSaving(true);
      try {
        await data.places.rate(placeId, { score, body: body.trim() ? body.trim() : null });
        // Both, and from the server. The summary comes back in the response, but
        // the place also carries `viewerRating`, and reloading is what proves the
        // write landed rather than assuming it from a 200.
        await reload();
        await loadReviews();
      } finally {
        setSaving(false);
      }
    },
    [data, placeId, body, reload, loadReviews],
  );

  const withdrawRating = useCallback(async () => {
    setSaving(true);
    try {
      await data.places.withdrawRating(placeId);
      setBody('');
      await reload();
      await loadReviews();
    } finally {
      setSaving(false);
    }
  }, [data, placeId, reload, loadReviews]);

  if (error) return <Failed message={error} />;
  if (!place) return <Failed message="Loading…" />;
  return (
    <PlaceScreen
      place={place}
      posts={state}
      reviews={reviews ?? []}
      reviewBody={body}
      savingReview={saving}
      signedIn={signedIn === true}
      followPending={pending}
      onToggleFollow={(next) => void toggleFollow(next)}
      onLoadMore={loadMore}
      onReport={() => onReport(placeId)}
      onRate={(score) => void rate(score)}
      onWithdrawRating={() => void withdrawRating()}
      onChangeReviewBody={setBody}
      // FR-014. The compound `<placeId>:<userId>` is the review's subject id -
      // the same shape messages already use, so the moderation queue needs no
      // new addressing scheme.
      onReportReview={(p, authorId) => onReport(`${p}:${authorId}`)}
      renderPost={(post) => (
        <PostCard post={post} onOpen={onOpenPost} />
      )}
    />
  );
}

/**
 * FR-013, FR-014.
 *
 * A 409 is not an error here: it carries the existing place, and the screen
 * offers it. Treating the duplicate as a failure is what makes somebody type a
 * slightly different name and create the duplicate anyway.
 */
export function CreatePlaceContainer({
  initialName,
  initialLocality,
  onCreated,
}: {
  initialName?: string;
  initialLocality?: string;
  onCreated: (place: PlaceSummary) => void;
}) {
  const data = useData();
  const [draft, setDraft] = useState<{
    name: string;
    category: PlaceCategory;
    locality: string;
    address: string;
  }>({
    name: initialName ?? '',
    category: 'restaurant',
    locality: initialLocality ?? '',
    address: '',
  });
  const [existing, setExisting] = useState<PlaceSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setSaving(true);
    setExisting(null);
    try {
      const place = await data.places.create({
        name: draft.name.trim(),
        category: draft.category,
        locality: draft.locality.trim(),
        ...(draft.address.trim() ? { address: draft.address.trim() } : {}),
      });
      onCreated(place);
    } catch (err) {
      const problem = err instanceof DataError ? (err.problem as unknown as PlaceSummary) : null;
      if (err instanceof DataError && err.status === 409 && problem?.placeId) {
        setExisting(problem);
      } else {
        setError(err instanceof DataError ? err.problem.title ?? 'Could not create' : 'Could not create');
      }
    } finally {
      setSaving(false);
    }
  }, [data, draft, onCreated]);

  if (error) return <Failed message={error} />;
  return (
    <CreatePlaceScreen
      name={draft.name}
      category={draft.category}
      locality={draft.locality}
      address={draft.address}
      existing={existing}
      saving={saving}
      onChange={(next) => setDraft((d) => ({ ...d, ...next }))}
      onSubmit={() => void submit()}
      onUseExisting={onCreated}
    />
  );
}

/** FR-038, FR-039. Surface 9 in the app. */
export function SavedContainer({ onOpenPost }: { onOpenPost: (postId: string) => void }) {
  const data = useData();
  const { state, error, loadMore } = usePaged(
    (cursor) => data.saved.list(cursor ? { cursor } : {}),
    [],
  );
  if (error) return <Failed message={error} />;
  return (
    <SavedScreen
      posts={state}
      onLoadMore={loadMore}
      renderPost={(post) => (
        <PostCard post={post} onOpen={onOpenPost} />
      )}
    />
  );
}


/**
 * 007/FR-014, FR-015, SC-002 — THE COLD START.
 *
 * It decides for itself whether there is anything to ask: an account that has
 * already seeded, or a catalogue that has not loaded, goes straight through.
 * `App` therefore navigates here unconditionally after sign-in, and the
 * condition lives in exactly one place — two copies of it is how one goes stale.
 *
 * SKIPPING IS A REAL PATH, not a lesser one. FR-015 requires a populated feed
 * for somebody who picks nothing, so skipping does not need repairing later and
 * the screen does not need to argue with them about it.
 */
export function PickInterestsContainer({ onDone }: { onDone: () => void }) {
  const data = useData();
  const [interests, setInterests] = useState<Interest[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void Promise.all([data.interests.listTop({ limit: 30 }), data.signals.disclosure()])
      .then(([top, disclosure]) => {
        if (!live) return;
        /**
         * Already ASKED — which is not the same as already picked. Skipping is
         * a real path (FR-015), so reading `seedInterests.length` would ask
         * again on every sign-in to anybody who declined, and a first-run
         * screen that reappears is the app forgetting you.
         */
        if (disclosure.coldStartComplete) {
          onDone();
          return;
        }
        setInterests(top.items);
      })
      .catch(() => live && onDone());
    return () => {
      live = false;
    };
  }, [data, onDone]);

  const toggle = useCallback((interestId: string) => {
    setPicked((current) =>
      current.includes(interestId)
        ? current.filter((id) => id !== interestId)
        : current.length >= MAX_PICKS
          ? current
          : [...current, interestId],
    );
  }, []);

  const commit = useCallback(
    async (ids: string[]) => {
      setSaving(true);
      try {
        /**
         * ALWAYS written, even for an empty list, so the answer "none" is
         * recorded as an answer. Guarding on `ids.length > 0` here is what
         * would make skipping unrecordable.
         */
        await data.signals.chooseSeedInterests(ids);
      } catch {
        // A failed seed is not a failed sign-up. The feed still works - it just
        // starts from exploration instead of from a hint, which FR-015 already
        // requires it to survive. Blocking somebody's first screen on this
        // would be strictly worse than the thing it is protecting.
      } finally {
        setSaving(false);
        onDone();
      }
    },
    [data, onDone],
  );

  if (!interests) return <View testID="pick-interests-loading" />;
  return (
    <PickInterestsScreen
      interests={interests}
      picked={picked}
      saving={saving}
      onToggle={toggle}
      onContinue={() => void commit(picked)}
      onSkip={() => void commit([])}
    />
  );
}
