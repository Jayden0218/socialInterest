/**
 * The rating aggregate, as pure arithmetic (005/R5).
 *
 * Separate from the repository so it can be tested without a datastore, and so
 * the four operations in data-model.md's table are one function rather than four
 * call sites that each do their own sum.
 */

/** The two counters a place carries. Both optional: a place written before 005 has neither. */
export interface RatingCounters {
  ratingSum?: number | undefined;
  ratingCount?: number | undefined;
}

/**
 * What a write does to a place's counters.
 *
 * `previous` and `next` are the person's OWN rating before and after - null on
 * either side meaning "they had none" or "they have none now". Every operation is
 * that one shape:
 *
 *   first rating      null -> 4     sum +4, count +1
 *   replace           5    -> 2     sum -3, count  0   <- FR-002: still one rater
 *   withdraw          4    -> null  sum -4, count -1
 *   moderator removal 1    -> null  sum -1, count -1   <- FR-016, R6
 *
 * Removal and withdrawal are deliberately the same arithmetic. R6's decision -
 * that a removed review takes its score with it - is what makes them the same,
 * and keeping one function means they cannot drift into disagreeing.
 */
export function aggregateDelta(input: {
  previous: number | null;
  next: number | null;
}): { sum: number; count: number } {
  const { previous, next } = input;
  return {
    sum: (next ?? 0) - (previous ?? 0),
    count: (next === null ? 0 : 1) - (previous === null ? 0 : 1),
  };
}

/**
 * A place's average, or null when there is nothing to average.
 *
 * NULL, NOT ZERO (FR-005). "Nobody has rated this" and "rated badly" are
 * different facts; 0 is not a legal score, so a zero here would be a value every
 * client had to special-case. The guard also covers two ways to get a wrong
 * number rather than an honest absence:
 *
 *  - A place written before 005 has neither counter. `sum / count` on two
 *    undefineds is NaN, and NaN serialises to `null` in JSON - so the bug would
 *    look exactly like the correct answer until a place had ratings.
 *  - A negative count means the aggregate has already drifted. Reporting an
 *    average from it dresses a corrupted number as a fact.
 */
export function averageOf(counters: RatingCounters): number | null {
  const count = counters.ratingCount ?? 0;
  const sum = counters.ratingSum ?? 0;
  if (count <= 0) return null;
  return Math.round((sum / count) * 10) / 10;
}
