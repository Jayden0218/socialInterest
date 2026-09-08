/**
 * The values research chose, named.
 *
 * Every number here was a decision in `specs/007-ranked-feed-redesign/research.md`,
 * not a default someone reached for. Naming them is what lets a later change be
 * argued with evidence rather than discovered in a diff.
 */

/** R2: a dwell below this is not attention - it is a scroll. */
export const SIGNAL_MIN_DWELL_MS = 3_000;

/**
 * R2: the ceiling on one dwell.
 *
 * An uncapped dwell measures a person who left their phone face-up on a table.
 * Enforced SERVER-side as well as on the client, because a modified client can
 * report any duration it likes (contracts/signals.md).
 */
export const SIGNAL_MAX_DWELL_MS = 30_000;

/** R2: how fast an interest fades when it stops being engaged with. */
export const SIGNAL_DECAY_HALF_LIFE_DAYS = 14;

/**
 * R5: the share of every page drawn from OUTSIDE the viewer's weighted set.
 *
 * This is correctness, not taste. A purely exploitative ranker is a feedback
 * loop: it shows what the profile favours, the profile is updated only from what
 * was shown, and the signals that would broaden it can never be generated. The
 * feed narrows and cannot recover - and no later tuning helps, because the data
 * to tune on was never collected.
 *
 * 0.2 is a starting value, not a measured optimum. It is a named constant so
 * that the first real usage data can change it.
 */
export const EXPLORE_EPSILON = 0.2;

/** R2: what each signal kind is worth before decay. */
export const SIGNAL_WEIGHTS = {
  /** Weakest: an open can be a mis-tap. */
  open: 0.3,
  /** Scaled by duration at the call site; this is the weight at the cap. */
  dwell: 1.0,
  like: 1.0,
  /** The strongest thing a person tells you: they intend to come back. */
  save: 2.0,
} as const;

export type SignalKind = keyof typeof SIGNAL_WEIGHTS;

/** contracts/signals.md: a batch is bounded, and the excess is rejected rather than truncated. */
export const SIGNAL_BATCH_MAX = 50;

/**
 * 007/FR-029 - what a follow is worth.
 *
 * Carries forward the intent of 001/FR-034, which said posts by followed people
 * outrank unfollowed authors WITHIN THE SAME INTEREST - a grouping the ranked
 * feed does not have (RS-007). The promise that survives is simpler: following
 * someone should mean something.
 *
 * Expressed as a time bonus, so a followed author's post competes as though it
 * were six hours newer. Bounded on purpose: it may REORDER and must never
 * ADMIT a post the ranking would not otherwise have considered, and it must not
 * consume the exploration share.
 */
export const FOLLOWED_AUTHOR_BOOST_MS = 6 * 60 * 60 * 1000;

/**
 * 007/FR-030. What a STANDING DECLARATION is worth — a seed pick at first run,
 * or an interest the person went and followed.
 *
 * One unit, the same as a like. Deliberately comparable to a single strong
 * behavioural signal rather than dominant over them: a declaration should be
 * enough to shape a feed that has no behaviour to go on, and should be overtaken
 * by a person who then reads something else for a fortnight. A large constant
 * here would rebuild the subscription feed inside the ranker.
 */
export const DECLARED_INTEREST_WEIGHT = 1;
