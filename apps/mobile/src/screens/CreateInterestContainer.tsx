/**
 * CreateInterestContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { useData } from '../data-provider';
import { DataError } from '../data';
import {
  CreateInterestScreen,
  stateForCandidates,
  SIMILARITY_CHECK_DEBOUNCE_MS,
  type CreateState,
} from '../features/discover/CreateInterestScreen';

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
