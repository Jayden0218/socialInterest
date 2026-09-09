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
  /**
   * WHAT KIND OF CONTENT this surface returns, and therefore which decision
   * table applies to it. Defaults to 'post'.
   *
   * 005 added the first surface that is not about posts. Without this the post
   * matrix - 7 post states x 6 viewers - would run against the review surface,
   * asserting things like "a followers-only review while processing" about a
   * thing that has neither a visibility setting nor a processing state. It would
   * have passed, too, because `decide()` would answer for a candidate built out
   * of invented fields; the count would have read 504 and meant nothing.
   */
  readonly kind?: 'post' | 'review';
}

export const SURFACES: readonly Surface[] = [
  // ---- feature 001's seven.
  { name: 'interest space', built: true, story: '001/US1 (T063)' },
  { name: 'profile', built: true, story: '001/US1 (T063)' },
  { name: 'interest search', built: true, story: '001/US2 (T082)' },
  /**
   * 007 MADE THIS SURFACE RANKED, and the row stays exactly as it was.
   *
   * That is the point. Under the composed feed this row was, quietly, the
   * weakest in the table: the feed only read partitions the viewer had
   * subscribed to, so its candidate set was already viewer-scoped and it could
   * not over-admit whatever it did afterwards. The matrix passed on it for a
   * reason that had nothing to do with the matrix.
   *
   * A ranked feed reads across the whole catalogue, so the accident is gone and
   * this row now asserts something. Principle II's enumeration MUST NOT shrink
   * when a surface changes how it selects - a surface that got harder to satisfy
   * is precisely the one to keep.
   */
  { name: 'home feed', built: true, story: '001/US3 (T098); RANKED by 007/US1 (T022)' },
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
  { name: 'place reviews', built: true, story: '005/US2 (T053)', kind: 'review' },

  // ---- feature 008 adds one in Phase A.
  //
  // The Following feed reads across the follow graph rather than the interest
  // partitions, so it is a NEW candidate source feeding the same boundary. That
  // is precisely the shape Principle II's second clause governs: it selects, and
  // `VisibilityFilter` still decides at read time, per request.
  { name: 'following feed', built: true, story: '008/US3 (T043)' },
  // Phase B. A term index selects candidates across the whole catalogue - the
  // same shape as `postInterestIndex` - so the boundary is what makes SC-009's
  // "unfindable by viewers who may not see it" true, not the index.
  { name: 'post search', built: true, story: '008/US6 (T098)' },
  /**
   * Phase C, surface 15. COMMENT REPLIES.
   *
   * The comments surface (6) has always been here, and a reply is read through
   * the same endpoint — so this row is not a second boundary call, it is the
   * assertion that the REPLY rows are gated by the post exactly as their
   * parents are. Without it, a change that listed replies from a different path
   * would leave the matrix reporting a green comments surface while a reply
   * leaked the existence of a post the viewer cannot open.
   */
  { name: 'comment replies', built: true, story: '008/US7 (T117)' },
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
  // 005
  'place reviews',
  // 008
  'following feed',
  'post search',
  'comment replies',
];

export const POST_STATE_COUNT = 7;
export const VIEWER_COUNT = 6;
export const TOTAL_ASSERTIONS = SURFACES.length * POST_STATE_COUNT * VIEWER_COUNT;
