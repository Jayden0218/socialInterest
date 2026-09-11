/**
 * ConversationContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConversationScreen } from '../features/conversations/ConversationScreen';
import type { Conversation, Message } from '@sih/shared';
import { useData } from '../data-provider';
import { DataError } from '../data';
import { Failed } from './shared';

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
