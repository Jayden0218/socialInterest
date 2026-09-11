/**
 * PickInterestsContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import type { Interest } from '@sih/shared';
import { PickInterestsScreen, MAX_PICKS } from '../features/onboarding/PickInterestsScreen';
import { useData } from '../data-provider';

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
