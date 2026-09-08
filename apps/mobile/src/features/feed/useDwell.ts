import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { Signal, SignalsData } from '../../data';

/** Research R7. A post counts as seen at 60% visible for 300ms. */
export const VIEWABILITY_THRESHOLD_PERCENT = 60;
export const VIEWABILITY_MINIMUM_MS = 300;
/** Flush cadence. Long enough to batch a scroll, short enough to survive a kill. */
export const FLUSH_INTERVAL_MS = 30_000;
/**
 * The client's own cap, and it is NOT the server's bound.
 *
 * The server clamps to 30s regardless (contracts/signals.md), because a client
 * cannot be trusted. This exists so an honest client does not keep counting a
 * post that is on screen because the phone is face-up on a table — measuring
 * furniture rather than attention. Deliberately equal to the server's clamp so
 * the two cannot be read as different rules.
 */
export const CLIENT_DWELL_CAP_MS = 30_000;

export interface DwellController {
  /** Called by the list with the ids currently meeting the viewability rule. */
  onViewableChanged(postIds: string[]): void;
  /** A deliberate act, sent immediately rather than batched. */
  record(signal: Signal): void;
  /** Sends everything pending. Called on background and on unmount. */
  flush(): Promise<void>;
}

/**
 * HOW LONG A POST WAS ACTUALLY LOOKED AT (007/FR-004, research R7).
 *
 * Three things make this a measurement rather than a guess, and each of them is
 * a way the naive version lies:
 *
 *  - **The clock stops when the app backgrounds.** Without this, putting the
 *    phone in a pocket records the whole time as attention, and the interest
 *    that happened to be on screen wins the ranking for a week.
 *  - **Per-post cap.** A post left on screen is bounded, for the same reason.
 *  - **Batched, and failures swallowed.** A signal is not something a person
 *    acts on. A lost batch must never surface as an error or block a scroll.
 *
 * The bounds here are courtesy, not enforcement: every one of them is applied
 * again server-side, because a modified client can skip all of this
 * (Principle III). They exist so an HONEST client sends honest numbers.
 */
export function useDwell(signals: Pick<SignalsData, 'record'>): DwellController {
  /** postId -> ms accumulated but not yet sent. */
  const pending = useRef(new Map<string, number>());
  /** postId -> the timestamp it became visible, for those on screen now. */
  const since = useRef(new Map<string, number>());
  const queue = useRef<Signal[]>([]);
  const foreground = useRef(true);

  const settle = useCallback((now: number) => {
    for (const [postId, from] of since.current) {
      const already = pending.current.get(postId) ?? 0;
      const add = Math.max(0, now - from);
      pending.current.set(postId, Math.min(already + add, CLIENT_DWELL_CAP_MS));
      since.current.set(postId, now);
    }
  }, []);

  const flush = useCallback(async () => {
    settle(Date.now());
    const batch: Signal[] = [...queue.current];
    queue.current = [];
    for (const [postId, dwellMs] of pending.current) {
      // Below the floor is not sent at all. The server would discard it, and
      // sending it anyway means reporting that this person saw this post for no
      // ranking benefit — data collected for nothing.
      if (dwellMs >= 3_000) batch.push({ kind: 'dwell', postId, dwellMs: Math.round(dwellMs) });
    }
    pending.current.clear();
    // Anything still on screen starts accumulating again from now, so a flush
    // mid-scroll does not silently reset the post the person is reading.
    const now = Date.now();
    for (const postId of since.current.keys()) since.current.set(postId, now);
    if (batch.length === 0) return;
    /**
     * SWALLOWED HERE TOO, not only in SignalsData.
     *
     * Both, because either one alone is a promise held in a single place, and
     * this one has three callers a person can feel: an interval, the AppState
     * transition, and unmount. A rejection escaping any of them is an unhandled
     * rejection in the middle of somebody's scroll.
     */
    try {
      await signals.record(batch);
    } catch {
      /* a lost signal ranks slightly worse; a thrown one breaks the feed */
    }
  }, [settle, signals]);

  const onViewableChanged = useCallback(
    (postIds: string[]) => {
      const now = Date.now();
      settle(now);
      const next = new Set(postIds);
      for (const postId of [...since.current.keys()]) {
        if (!next.has(postId)) since.current.delete(postId);
      }
      // Only while the app is in front. A viewability callback can fire during
      // a background transition, and starting a clock there is the bug this
      // whole hook exists to avoid.
      if (foreground.current) {
        for (const postId of next) if (!since.current.has(postId)) since.current.set(postId, now);
      }
    },
    [settle],
  );

  const record = useCallback((signal: Signal) => {
    queue.current.push(signal);
  }, []);

  useEffect(() => {
    const onAppState = (status: AppStateStatus) => {
      const active = status === 'active';
      if (active === foreground.current) return;
      foreground.current = active;
      if (active) {
        // Restart every visible post's clock from NOW, so the time spent away
        // is not counted.
        const now = Date.now();
        for (const postId of since.current.keys()) since.current.set(postId, now);
      } else {
        settle(Date.now());
        since.current.clear();
        // Backgrounding is the last reliable moment to send. A process killed
        // afterwards takes everything unsent with it.
        void flush();
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    const timer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
      void flush();
    };
  }, [flush, settle]);

  return useMemo(() => ({ onViewableChanged, record, flush }), [onViewableChanged, record, flush]);
}
