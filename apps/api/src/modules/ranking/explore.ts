import { EXPLORE_EPSILON } from './constants';

/**
 * FR-007 — THE ANTI-COLLAPSE SHARE, and it is CORRECTNESS rather than taste.
 *
 * A purely exploitative ranker is a positive feedback loop. It shows what the
 * profile favours; the profile is updated only from what was shown; so the
 * signals that would broaden it can never be generated. The feed narrows and
 * cannot recover - and no later tuning helps, because the data to tune on was
 * never collected.
 *
 * Epsilon-greedy is the simplest thing that breaks the loop. A bandit with
 * posterior updates is the principled answer and needs interaction volume this
 * product does not have (research R5).
 */

/** How many of a page of `limit` should come from outside the weighted set. */
export function exploreCount(limit: number, epsilon = EXPLORE_EPSILON): number {
  // At least one, always. A page that rounds its exploration down to zero is a
  // page that cannot broaden anything, which is the failure this prevents.
  return Math.max(1, Math.round(limit * epsilon));
}

/**
 * Interests to explore: catalogue members the viewer's profile does not already
 * favour, sampled rather than taken in order so two consecutive pages differ.
 */
export function chooseExploreInterests(
  catalogue: string[],
  exploited: string[],
  count: number,
  random: () => number = Math.random,
): string[] {
  const known = new Set(exploited);
  const pool = catalogue.filter((id) => !known.has(id));
  if (pool.length <= count) return pool;

  const picked = new Set<string>();
  // Bounded attempts: a sample, not a shuffle of the whole catalogue.
  for (let i = 0; i < count * 8 && picked.size < count; i++) {
    picked.add(pool[Math.floor(random() * pool.length)]!);
  }
  return [...picked];
}
