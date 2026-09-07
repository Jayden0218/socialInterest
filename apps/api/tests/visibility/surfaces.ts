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
  { name: 'saved posts', built: true, story: '004/US5 (T122)' },
  { name: 'shared post in a message', built: true, story: '004/US1 (T040)' },
  { name: 'in-interest search', built: true, story: '004/US3 (T096)' },

  // ---- feature 005 adds one, and it is a different KIND of read.
  //
  // The place page is already surface 8 and returns posts. It now returns
  // reviews too, through a second entry point (research R4), and both must be
  // probed: a routing probe covering only the post path would report the place
  // page as consulting the boundary while its review path did not.
  //
  // `built: false` DELIBERATELY, while US2 is in progress. 004/T128 turned this
  // list into a ratchet, and the two failure modes are opposite: adding this row
  // as `built: true` before the code exists fails the ratchet, and leaving it out
  // entirely lets the suite report a smaller green number while a surface is
  // uncovered. False is the honest value until T053 flips it.
  { name: 'place reviews', built: false, story: '005/US2 (T053)' },
] as const;

/**
 * SURFACES THAT HAVE EVER BEEN COVERED. Append-only, never edited down.
 *
 * This is what makes the check in matrix.spec.ts an actual ratchet rather than a
 * snapshot. 004/T128 asserted "no surface is unbuilt", which catches the failure
 * it was written for - a covered surface silently flipping to `built: false` and
 * the suite reporting a smaller green number - but cannot tell that case apart
 * from a surface honestly in progress. The result was that adding surface 12
 * before its implementation turned the whole API suite red for forty unrelated
 * tasks, which is how a signal stops being read.
 *
 * Splitting them keeps the guarantee and drops the false alarm: a name here MUST
 * be built, so a regression still fails loudly, while a genuinely new surface may
 * be `false` until its work lands. Removing a name from this list to quiet a
 * failure is a deliberate, reviewable edit rather than a one-word flip.
 */
export const EVER_BUILT: readonly string[] = [
  'interest space',
  'profile',
  'interest search',
  'home feed',
  'share link',
  'comments',
  'notifications',
  'place page',
  'saved posts',
  'shared post in a message',
  'in-interest search',
];

export const POST_STATE_COUNT = 7;
export const VIEWER_COUNT = 6;
export const TOTAL_ASSERTIONS = SURFACES.length * POST_STATE_COUNT * VIEWER_COUNT;
