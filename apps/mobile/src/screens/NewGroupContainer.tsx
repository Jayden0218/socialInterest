/**
 * NewGroupContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { NewGroupScreen } from '../features/conversations/NewGroupScreen';
import type { PublicProfile } from '@sih/shared';
import { useData } from '../data-provider';
import { DataError } from '../data';

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
