/**
 * 008/US6 — TURNING A CAPTION INTO SEARCHABLE TERMS (research R6).
 *
 * Deliberately simple, and the limits are stated rather than implied:
 * whitespace-and-punctuation splitting with case folding. No stemming, no
 * phrases, no relevance beyond recency. SC-009 asks for findability "by any
 * distinctive word", which this meets; it does not claim more.
 */

/**
 * The cap, and it is NOT a free tuning knob.
 *
 * Term rows are written inside `PostTransaction`'s existing `TransactWriteItems`,
 * which caps at 100 items. `PostTransaction` documents its own bound today — at
 * most 10 media, 2 index items per interest, one place item, "well inside" the
 * limit. Forty term rows takes the worst case to roughly 60 and narrows that
 * margin from comfortable to merely sufficient.
 *
 * Raising this, or the media limit, must be re-checked against the 100-item
 * ceiling, which 005/R3 established is a CORRECTNESS constraint rather than a
 * preference: the next size up would not be a bigger post but a silently
 * truncated one.
 */
export const MAX_TERMS_PER_POST = 40;

/** The shortest token worth a partition of its own. */
export const MIN_TERM_LENGTH = 2;

/**
 * Words too common to be worth indexing.
 *
 * A STARTING VALUE, not a measured optimum, and named so the first real usage
 * data can change it. Its purpose is partition size: `TERM#the` would collect
 * essentially every post, and a query for it would read them all to return
 * nothing anybody wanted.
 *
 * English only, which is an honest limit of a product with one locale and no
 * localisation (008 excludes it deliberately). A second locale needs a second
 * list, or none at all.
 */
export const STOP_WORDS: ReadonlySet<string> = new Set([
  // The two-letter function words. `MIN_TERM_LENGTH` is 2, so these ARE
  // indexable without this line — the first draft of this list omitted them and
  // the tests written alongside caught `at` and `of` immediately.
  //
  // `up`, `go`, `no` and the like are deliberately ABSENT: they are short and
  // they carry meaning, and a search for "up" in a climbing product is not
  // obviously noise. The line between the two is a judgement, which is why this
  // is a named constant a later reader can argue with.
  'at', 'of', 'to', 'in', 'on', 'is', 'it', 'as', 'by', 'an', 'be', 'or',
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'her', 'was',
  'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may',
  'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'she', 'use',
  'with', 'this', 'that', 'from', 'they', 'been', 'have', 'were', 'said',
  'each', 'which', 'their', 'will', 'about', 'would', 'there', 'them',
  'just', 'like', 'some', 'what', 'when', 'your', 'more', 'than', 'then',
  'into', 'only', 'over', 'also', 'back', 'after', 'other', 'many', 'these',
]);

/**
 * Distinct terms for a caption, in first-appearance order, capped.
 *
 * FIRST-APPEARANCE ORDER matters when the cap bites: the words a person wrote
 * first are the ones most likely to be what the post is about, and truncating
 * from the end is the least surprising place to lose one.
 */
export function tokenise(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < MIN_TERM_LENGTH) continue;
    if (STOP_WORDS.has(raw)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length === MAX_TERMS_PER_POST) break;
  }
  return out;
}

/**
 * The terms a QUERY asks for.
 *
 * The same tokeniser, so a word that could not be indexed cannot be searched
 * for either — two tokenisers is two chances to disagree, and the disagreement
 * would look like a post that exists and cannot be found.
 */
export function queryTerms(query: string): string[] {
  return tokenise(query);
}
