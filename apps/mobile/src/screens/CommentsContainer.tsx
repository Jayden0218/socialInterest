/**
 * CommentsContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { completeMention, trailingMention } from '../components/MentionSuggest';
import type { PublicProfile } from '@sih/shared';
import { usePaged } from '../containers';
import type { Comment } from '@sih/shared';
import { CommentsScreen } from '../features/engagement/CommentsScreen';
import { useData } from '../data-provider';
import { DataError } from '../data';
import { Failed } from './shared';

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
