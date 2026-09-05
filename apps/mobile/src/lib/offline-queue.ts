/**
 * Offline tolerance, per the spec's edge case: "previously loaded content
 * remains viewable and new actions queue rather than failing silently".
 *
 * Both halves matter. Content staying viewable is the easy half. The hard half
 * is that a queued action must be visible AS queued - a reaction that silently
 * disappears when the network drops is worse than one that visibly fails,
 * because the person believes it landed.
 */
export type QueuedAction =
  | { kind: 'react'; postId: string; on: boolean }
  | { kind: 'comment'; postId: string; body: string }
  | { kind: 'follow_interest'; interestId: string; on: boolean }
  | { kind: 'follow_person'; handle: string; on: boolean };

export interface QueueEntry {
  id: string;
  action: QueuedAction;
  queuedAt: number;
  attempts: number;
  lastError?: string;
}

export interface QueueState {
  online: boolean;
  entries: QueueEntry[];
}

export const emptyQueue = (): QueueState => ({ online: true, entries: [] });

export function enqueue(
  state: QueueState,
  action: QueuedAction,
  id: string,
  now = Date.now(),
): QueueState {
  // Collapse repeats of the same toggle: going offline and tapping a reaction
  // four times should replay once, in its final position.
  const superseded = state.entries.filter((e) => !supersedes(action, e.action));
  return { ...state, entries: [...superseded, { id, action, queuedAt: now, attempts: 0 }] };
}

function supersedes(next: QueuedAction, existing: QueuedAction): boolean {
  if (next.kind !== existing.kind) return false;
  switch (next.kind) {
    case 'react':
      return existing.kind === 'react' && existing.postId === next.postId;
    case 'follow_interest':
      return existing.kind === 'follow_interest' && existing.interestId === next.interestId;
    case 'follow_person':
      return existing.kind === 'follow_person' && existing.handle === next.handle;
    case 'comment':
      // Comments are never collapsed - each is a distinct thing someone said.
      return false;
  }
}

export function markFailed(state: QueueState, id: string, error: string): QueueState {
  return {
    ...state,
    entries: state.entries.map((e) =>
      e.id === id ? { ...e, attempts: e.attempts + 1, lastError: error } : e,
    ),
  };
}

export function markSucceeded(state: QueueState, id: string): QueueState {
  return { ...state, entries: state.entries.filter((e) => e.id !== id) };
}

/** Anything queued shows as pending, so nothing appears to have landed when it has not. */
export function pendingCount(state: QueueState): number {
  return state.entries.length;
}

export function shouldDrain(state: QueueState): boolean {
  return state.online && state.entries.length > 0;
}
