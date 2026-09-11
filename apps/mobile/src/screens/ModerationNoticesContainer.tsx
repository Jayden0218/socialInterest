/**
 * ModerationNoticesContainer
 *
 * One container per file. Until 2026-09-11 every container in this app lived in
 * a single 2,726-line `screens/index.tsx`, which `index.tsx` now re-exports so
 * nothing outside this directory changed. See ./README.md for why.
 */
import { useCallback, useEffect, useState } from 'react';
import { ModerationNoticesScreen } from '../features/safety/ModerationNoticesScreen';
import { useData } from '../data-provider';
import { DataError, type ModerationNotice, type Appeal } from '../data';

/**
 * 008/US14, FR-046 and FR-047 — REMOVED CONTENT, AND APPEALING IT.
 *
 * Notices and appeals are loaded TOGETHER, because a notice on its own cannot
 * say what happened to the appeal it carries: the notice knows an `appealId` and
 * the outcome lives on the appeal. Two lists, one screen, one load — the
 * alternative is a request per row, which is the shape that works with three
 * notices and stops working quietly.
 *
 * Neither list is paged here. Both are bounded by things that happened to ONE
 * person, and a person with more than fifty moderation notices has a problem
 * this screen is not going to solve.
 */
export function ModerationNoticesContainer() {
  const data = useData();
  const [notices, setNotices] = useState<ModerationNotice[]>([]);
  const [appeals, setAppeals] = useState<Appeal[]>([]);
  const [drafting, setDrafting] = useState<string | null>(null);
  const [draftBody, setDraftBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [n, a] = await Promise.all([
      data.safety.moderationNotices({ limit: 50 }),
      data.safety.appeals({ limit: 50 }),
    ]);
    setNotices(n.items);
    setAppeals(a.items);
  }, [data]);

  useEffect(() => {
    let live = true;
    void reload().catch((e: unknown) => {
      if (live) setError(e instanceof DataError ? e.message : String(e));
    });
    return () => {
      live = false;
    };
  }, [reload]);

  const submitAppeal = useCallback(async () => {
    if (!drafting) return;
    setSubmitting(true);
    try {
      await data.safety.appeal(drafting, draftBody);
      /**
       * RE-READ rather than splicing the new appeal in locally. The notice's
       * `appealId` is written server-side, and a client that set it itself would
       * be maintaining a second copy of the one fact that decides whether the
       * Appeal button is offered again — and offering it again produces a 409
       * that reads as a bug.
       */
      await reload();
      setDrafting(null);
      setDraftBody('');
    } catch (e: unknown) {
      setError(e instanceof DataError ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [data, drafting, draftBody, reload]);

  return (
    <ModerationNoticesScreen
      notices={notices}
      appeals={appeals}
      drafting={drafting}
      draftBody={draftBody}
      submitting={submitting}
      error={error}
      onStartAppeal={(actionId) => {
        setDrafting(actionId);
        setDraftBody('');
      }}
      onDraftChange={setDraftBody}
      onSubmitAppeal={() => void submitAppeal()}
      onCancelAppeal={() => {
        setDrafting(null);
        setDraftBody('');
      }}
    />
  );
}
