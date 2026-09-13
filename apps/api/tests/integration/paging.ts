/**
 * Find something across ALL pages of a bounded list, not just the first one.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THIS EXISTS BECAUSE THE SAME FALSE REGRESSION HAS NOW HAPPENED SIX TIMES
 * ────────────────────────────────────────────────────────────────────────────
 *
 * `people-search-scale` three times, `review-moderation` once before, and on
 * 2026-09-13 both the moderation audit trail and the report queue in one
 * afternoon. Every occurrence is the same mistake in a different file:
 *
 *   a test writes one row, then asserts it appears in the FIRST PAGE of an
 *   ASCENDING list, over a datastore SHARED ACROSS RUNS.
 *
 * That assertion is true until the list holds more rows than the page size, and
 * then it is false forever, and it fails looking exactly like a product defect.
 * Three of the six were investigated as product defects before somebody counted
 * the rows. The counts on the day this file was written: `MODLOG#2026-09` held
 * 105 against a limit of 100, and `RSTATE#open` held 32 against a limit of 25.
 *
 * **The product is not wrong in any of these cases.** An append-only audit trail
 * read chronologically and a moderation queue showing the oldest open report
 * first are both correct — an operator works a backlog from the front. What is
 * wrong is a test asserting a claim about a PAGE while meaning a claim about the
 * LIST.
 *
 * CLAUDE.md's rule is "count the table before believing a paging failure", and
 * that rule is what turned each of these from an investigation into a minute.
 * This is the next step: **not needing to count.** The assertion now says what it
 * means, and it stays true at any row count.
 *
 * ONE HELPER RATHER THAN A FIX PER FILE, for the reason
 * `tests/unit/support/forbidden-imports.ts` gives about its own four callers:
 * four copies of a thing is four places to get it wrong, and the next surface
 * that grows past its page size should reach for this rather than rediscover it.
 */

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}

export async function findAcrossPages<T>(
  fetchPage: (cursor: string | null) => Promise<CursorPage<T>>,
  match: (item: T) => boolean,
  opts: { maxPages?: number } = {},
): Promise<boolean> {
  const maxPages = opts.maxPages ?? 50;
  let cursor: string | null = null;

  /**
   * BOUNDED, because a cursor that never terminates is worse than one that
   * fails: jest's own timeout is then the only thing that ends the run, and it
   * says nothing about where. 005 records a stub whose instant resolve turned a
   * long-poll into a microtask spin — the suite hung for 120 seconds with no
   * output at all rather than failing.
   */
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(cursor);
    if (result.items.some(match)) return true;
    if (!result.nextCursor) return false;
    cursor = result.nextCursor;
  }
  throw new Error(
    `findAcrossPages gave up after ${maxPages} pages without reaching the end — ` +
      'either the list is enormous or the cursor is not advancing.',
  );
}
