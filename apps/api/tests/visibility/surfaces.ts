/**
 * The surface list, in ONE place.
 *
 * Two suites consume it - matrix.spec.ts (does the filter implement the decision
 * table?) and surface-routing.spec.ts (does each surface actually consult the
 * filter?). Keeping the list in a shared module is what stops those two drifting:
 * adding a surface to one and forgetting the other would produce a green suite
 * whose count says 462 and whose coverage is 420.
 *
 * Sources: 001/contracts/visibility-matrix.md and
 * 004/contracts/visibility-matrix-addendum.md Part 1.
 */
export interface Surface {
  readonly name: string;
  /** Enabled by the story that builds it. `false` means SKIPPED, never passed. */
  readonly built: boolean;
  readonly story: string;
}

export const SURFACES: readonly Surface[] = [
  // ---- feature 001's seven.
  { name: 'interest space', built: true, story: '001/US1 (T063)' },
  { name: 'profile', built: true, story: '001/US1 (T063)' },
  { name: 'interest search', built: true, story: '001/US2 (T082)' },
  { name: 'home feed', built: true, story: '001/US3 (T098)' },
  { name: 'share link', built: true, story: '001/US5 (T122)' },
  { name: 'comments', built: true, story: '001/US5 (T122)' },
  { name: 'notifications', built: true, story: '001/T154 - closed 001 SC-009' },

  // ---- feature 004 adds four. Each is a read path that can return a post, so
  // Constitution II binds it and the matrix must hold on it.
  { name: 'place page', built: true, story: '004/US2 (T071)' },
  { name: 'saved posts', built: false, story: '004/US5 (T122)' },
  { name: 'shared post in a message', built: true, story: '004/US1 (T040)' },
  { name: 'in-interest search', built: false, story: '004/US3 (T096)' },
] as const;

export const POST_STATE_COUNT = 7;
export const VIEWER_COUNT = 6;
export const TOTAL_ASSERTIONS = SURFACES.length * POST_STATE_COUNT * VIEWER_COUNT;
