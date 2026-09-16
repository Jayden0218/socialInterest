/**
 * InboxContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useEffect, useState } from 'react';
import { InboxScreen, emptyInboxCopy } from '../features/conversations/InboxScreen';
import type { ConversationState } from '@sih/shared';
import { useData } from '../data-provider';
import { usePaged } from '../containers/usePaged';
import { surfaceFallback } from '../ui/SurfaceStates';

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
  const [requestCount, setRequestCount] = useState(0);

  /**
   * 012/T017a. THIS WAS THE ONE PRIMARY SURFACE `usePaged` DID NOT REACH.
   *
   * Five hooks in `containers/index.ts` wrap it and cover Feed, Explore,
   * Activity and Profile. Chats hand-rolled `useState`/`useEffect` — and its
   * `load` set no loading flag at all, so there was nothing for a loading state
   * to read even if a screen had wanted one.
   *
   * Left alone, T018 would have hand-written a twenty-sixth state machine on
   * the very surface this feature exists to fix, which is the outcome the
   * "derive once" decision was made to prevent. The `inbox` dependency does
   * what the old `useEffect` did: switching inbox restarts the read.
   *
   * The old error branch's comment is worth keeping, because it was right and
   * it is now the boundary's job: never an empty list for a failed load —
   * "no messages yet" for a dropped connection is the mistake this prevents.
   */
  const conversations = usePaged(() => data.conversations.list({ state: inbox, limit: 30 }), [
    data,
    inbox,
  ]);

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

  /**
   * 012/T018. A fallback rather than a wrapper: the screen keeps its header and
   * its Messages / Requests switcher in every state. Wrapping was the first
   * attempt and it took the "new group" control off an empty inbox — an empty
   * state that removes the way out of being empty.
   */
  const fallback = surfaceFallback(conversations, {
    shape: 'list',
    ids: { loading: 'inbox-loading', empty: 'inbox-empty', failed: 'inbox-failed' },
    /**
     * The screen's own per-inbox wording, kept: Requests and Messages are
     * different kinds of empty and deserve different sentences. What moved is
     * the DECISION, not the copy.
     */
    empty: { icon: 'chats', ...emptyInboxCopy(inbox) },
  });

  return (
    <InboxScreen
      state={inbox}
      conversations={conversations.state.items}
      onSelectInbox={setInbox}
      onOpen={(c) => onOpen(c.conversationId, c.other?.handle ?? null)}
      requestCount={requestCount}
      refreshing={conversations.refreshing}
      onRefresh={conversations.refresh}
      {...(fallback ? { fallback } : {})}
      {...(onNewGroup ? { onNewGroup } : {})}
    />
  );
}
