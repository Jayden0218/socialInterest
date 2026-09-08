import { SIGNAL_DECAY_HALF_LIFE_DAYS } from './constants';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A stored weight, aged.
 *
 * APPLIED ON READ, from the stored timestamp - never by rewriting rows on a
 * schedule (research R3). Folding decay into storage would mean a job that
 * rewrites every profile periodically: a scheduler, a failure mode and a cost,
 * to compute something one exponent produces on read.
 *
 * Exponential rather than a window. A hard window drops history at a cliff;
 * this lets an interest fade without one, and needs a single timestamp to do it.
 */
export function decayed(weight: number, updatedAt: string, now = Date.now()): number {
  const ageMs = Math.max(0, now - Date.parse(updatedAt));
  return weight * Math.pow(0.5, ageMs / (SIGNAL_DECAY_HALF_LIFE_DAYS * DAY_MS));
}

export interface StoredWeight {
  w: number;
  at: string;
}

/**
 * The profile, aged and ordered - highest interest first.
 *
 * Returns every interest rather than a top-N slice: the caller decides how many
 * it wants, and the explanation shown in Settings and the candidate source read
 * THE SAME function, so what a person is told cannot drift from what they get.
 */
export function rankedInterests(
  weights: Record<string, StoredWeight>,
  now = Date.now(),
): { interestId: string; weight: number }[] {
  return Object.entries(weights)
    .map(([interestId, s]) => ({ interestId, weight: decayed(s.w, s.at, now) }))
    .filter((e) => e.weight > 0.001)
    .sort((a, b) => b.weight - a.weight);
}
