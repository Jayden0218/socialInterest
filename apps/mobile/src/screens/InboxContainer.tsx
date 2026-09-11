/**
 * InboxContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { InboxScreen } from '../features/conversations/InboxScreen';
import type { ConversationState, ConversationSummary } from '@sih/shared';
import { useData } from '../data-provider';
import { DataError } from '../data';
import { Failed } from './shared';

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
