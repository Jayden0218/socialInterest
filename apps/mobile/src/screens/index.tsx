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
