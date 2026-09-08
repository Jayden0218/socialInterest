import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useDwell, CLIENT_DWELL_CAP_MS, FLUSH_INTERVAL_MS } from '../features/feed/useDwell';
import type { Signal } from '../data';

/**
 * 007/FR-004 — DWELL IS A MEASUREMENT, AND THE NAIVE VERSION LIES.
 *
 * Each test below is one way it lies. A hook that just accumulates wall-clock
 * time between viewability callbacks reports a phone in a pocket as attention,
 * a post left on screen overnight as a passion, and a scroll back and forth as
 * two separate readings.
 *
 * None of this is enforcement — the server clamps, floors and de-duplicates
 * regardless, because a modified client can skip every line of this file. These
 * bounds exist so an HONEST client sends honest numbers, and the tests are here
 * because "honest" is not something you can tell by reading the hook.
 */
describe('useDwell', () => {
  let sent: Signal[][];
  let signals: { record: jest.Mock };
  let now: number;
  /**
   * The AppState listener the hook registers, captured by SPYING rather than by
   * reading `.mock.calls` off the real one — which is not a mock under the RN
   * preset, so the first version of this file silently captured `undefined`,
   * never delivered a background event, and reported the hook as broken when
   * the TEST was.
   */
  let appState: ((s: string) => void) | undefined;

  const at = (ms: number) => {
    now = ms;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    sent = [];
    signals = {
      record: jest.fn(async (batch: Signal[]) => {
        sent.push(batch);
        return { accepted: batch.length, rejected: 0 };
      }),
    };
    now = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    appState = undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_e: string, cb: (s: string) => void) => {
      appState = cb;
      return { remove: () => undefined };
    }) as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  const flat = () => sent.flat();

  it('reports the time a post was actually on screen', async () => {
    const { result } = renderHook(() => useDwell(signals as never));
    act(() => result.current.onViewableChanged(['p1']));
    at(now + 8_000);
    await act(async () => {
      await result.current.flush();
    });

    expect(flat()).toEqual([{ kind: 'dwell', postId: 'p1', dwellMs: 8_000 }]);
  });

  it('does NOT count time while the app is backgrounded', async () => {
    const { result } = renderHook(() => useDwell(signals as never));
    act(() => result.current.onViewableChanged(['p1']));
    at(now + 5_000);

    // Away for an hour. Without the AppState clock this reads as an hour of
    // attention, and whatever was on screen wins the ranking for a week.
    act(() => appState!('background'));
    at(now + 3_600_000);
    act(() => appState!('active'));
    act(() => result.current.onViewableChanged(['p1']));
    at(now + 4_000);

    await act(async () => {
      await result.current.flush();
    });

    const total = flat()
      .filter((s) => s.postId === 'p1' && s.kind === 'dwell')
      .reduce((a, s) => a + (s.dwellMs ?? 0), 0);
    expect(total).toBe(9_000);
  });

  it('caps one post, so a phone left face-up is not a preference', async () => {
    const { result } = renderHook(() => useDwell(signals as never));
    act(() => result.current.onViewableChanged(['p1']));
    at(now + 6 * 60 * 60 * 1000);
    await act(async () => {
      await result.current.flush();
    });

    expect(flat()[0]!.dwellMs).toBe(CLIENT_DWELL_CAP_MS);
  });

  it('drops a glance below the floor instead of sending a zero', async () => {
    const { result } = renderHook(() => useDwell(signals as never));
    act(() => result.current.onViewableChanged(['p1']));
    at(now + 900);
    act(() => result.current.onViewableChanged([]));
    await act(async () => {
      await result.current.flush();
    });

    // Not "sent with a small number": NOT SENT. A zero-weight event still
    // records that this person saw this post, for no ranking benefit.
    expect(signals.record).not.toHaveBeenCalled();
  });

  it('accumulates a post scrolled away from and back, as one reading', async () => {
    const { result } = renderHook(() => useDwell(signals as never));
    act(() => result.current.onViewableChanged(['p1']));
    at(now + 2_000);
    act(() => result.current.onViewableChanged([]));
    at(now + 60_000);
    act(() => result.current.onViewableChanged(['p1']));
    at(now + 2_500);
    await act(async () => {
      await result.current.flush();
    });

    // 4,500ms of attention across two visits - over the floor, where two
    // separate readings of 2,000 and 2,500 would both have been discarded.
    expect(flat()).toEqual([{ kind: 'dwell', postId: 'p1', dwellMs: 4_500 }]);
  });

  it('sends deliberate signals in the same batch', async () => {
    const { result } = renderHook(() => useDwell(signals as never));
    act(() => result.current.record({ kind: 'save', postId: 'p9' }));
    act(() => result.current.onViewableChanged(['p1']));
    at(now + 5_000);
    await act(async () => {
      await result.current.flush();
    });

    expect(flat()).toEqual([
      { kind: 'save', postId: 'p9' },
      { kind: 'dwell', postId: 'p1', dwellMs: 5_000 },
    ]);
  });

  it('flushes on a timer without being asked', async () => {
    const { result } = renderHook(() => useDwell(signals as never));
    act(() => result.current.onViewableChanged(['p1']));
    at(now + 10_000);
    await act(async () => {
      jest.advanceTimersByTime(FLUSH_INTERVAL_MS);
    });
    expect(signals.record).toHaveBeenCalled();
  });

  it('a flush mid-scroll does not reset the post being read', async () => {
    const { result } = renderHook(() => useDwell(signals as never));
    act(() => result.current.onViewableChanged(['p1']));
    at(now + 5_000);
    await act(async () => {
      await result.current.flush();
    });
    at(now + 4_000);
    await act(async () => {
      await result.current.flush();
    });

    /**
     * Two readings that CONTINUE, not one followed by silence. The failure this
     * guards is the tempting simplification - clearing `since` on flush - which
     * stops the clock on whatever the person is reading at the moment the timer
     * happens to fire, so a long read is systematically under-reported.
     */
    expect(flat()).toEqual([
      { kind: 'dwell', postId: 'p1', dwellMs: 5_000 },
      { kind: 'dwell', postId: 'p1', dwellMs: 4_000 },
    ]);
  });

  it('never surfaces a failure', async () => {
    signals.record.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useDwell(signals as never));
    act(() => result.current.onViewableChanged(['p1']));
    at(now + 9_000);

    /**
     * RESOLVES, does not reject. `flush` has three callers a person can feel -
     * an interval, the AppState transition and unmount - and a rejection
     * escaping any of them is an unhandled rejection in the middle of somebody's
     * scroll. A lost signal ranks slightly worse; a thrown one breaks the feed.
     */
    await act(async () => {
      await expect(result.current.flush()).resolves.toBeUndefined();
    });
    expect(signals.record).toHaveBeenCalled();
  });
});
