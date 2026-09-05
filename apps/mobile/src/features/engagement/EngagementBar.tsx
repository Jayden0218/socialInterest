export interface EngagementState {
  reactionCount: number;
  commentCount: number;
  viewerHasReacted: boolean;
}

/**
 * FR-039. The server is idempotent, so the optimistic update can be too: a
 * double-tap toggles rather than accumulating, and a failed request rolls back
 * to the server's number rather than to a guessed one.
 */
export function optimisticToggle(state: EngagementState): EngagementState {
  return state.viewerHasReacted
    ? { ...state, viewerHasReacted: false, reactionCount: Math.max(0, state.reactionCount - 1) }
    : { ...state, viewerHasReacted: true, reactionCount: state.reactionCount + 1 };
}

export function reconcile(state: EngagementState, server: Partial<EngagementState>): EngagementState {
  return { ...state, ...server };
}

export function EngagementBar() {
  return null;
}
