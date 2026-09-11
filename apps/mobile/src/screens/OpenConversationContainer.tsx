/**
 * OpenConversationContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useEffect, useState } from 'react';
import { useData } from '../data-provider';
import { DataError } from '../data';
import { Failed } from './shared';

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
