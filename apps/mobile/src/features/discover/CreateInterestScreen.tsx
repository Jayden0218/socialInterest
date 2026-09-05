import type { Interest } from '@sih/shared';

export interface SimilarCandidate {
  interest: Interest;
  similarity: number;
}

/**
 * FR-023. The near-duplicate warning appears WHILE typing, via
 * GET /interests/similar, so the person can join the existing interest instead
 * of discovering the clash only when their submission is rejected.
 *
 * SC-008 measures whether this works: fewer than 10% of new sub-interests should
 * later be merged away as duplicates.
 */
export const SIMILARITY_CHECK_DEBOUNCE_MS = 300;

export type CreateState =
  | { kind: 'editing' }
  | { kind: 'similar_found'; candidates: SimilarCandidate[] }
  | { kind: 'blocked'; candidates: SimilarCandidate[] }
  | { kind: 'submitting' }
  | { kind: 'rejected'; title: string; detail?: string };

/** Above this the server refuses; below it, the client only warns. */
export const BLOCKING_SIMILARITY = 0.85;

export function stateForCandidates(candidates: SimilarCandidate[]): CreateState {
  if (candidates.length === 0) return { kind: 'editing' };
  return candidates.some((c) => c.similarity >= BLOCKING_SIMILARITY)
    ? { kind: 'blocked', candidates }
    : { kind: 'similar_found', candidates };
}

export function canSubmit(state: CreateState, name: string): boolean {
  return name.trim().length >= 2 && state.kind !== 'blocked' && state.kind !== 'submitting';
}

export function CreateInterestScreen() {
  return null;
}
