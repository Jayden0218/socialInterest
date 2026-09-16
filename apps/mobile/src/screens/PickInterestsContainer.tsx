/**
 * PickInterestsContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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
        /**
         * 012/T041, 013/FR-017. NOTHING TO OFFER IS A REASON NOT TO ASK.
         *
         * Until 013 the catalogue was twelve interests that shipped with the
         * product, so this screen always had something on it. It ships with
         * none now, and on a fresh install `listTop` comes back empty — so the
         * first thing the product would do to a person is show them an empty
         * grid, a "0 picked" counter and a Continue button that records the
         * answer "none" they were never given a chance to give.
         *
         * Asking a question with no answers on it is worse than not asking. The
         * answer is recorded as "none" — which is TRUE, and is what keeps the
         * screen from reappearing on every sign-in — and they go straight to the
         * feed, which since T044 offers them the one action that exists on an
         * empty install: publish something.
         */
        if (top.items.length === 0) {
          void commitRef.current([]);
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

  /**
   * A REF, because the effect above needs `commit` and `commit` is declared
   * below it. Putting `commit` in the effect's dependency list would re-run the
   * whole cold-start check whenever its identity changed, which is the shape
   * that makes a first-run screen flicker.
   */
  const commitRef = useRef<(ids: string[]) => Promise<void>>(async () => undefined);

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

  commitRef.current = commit;

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
