/**
 * 013. THE ONE DEFINITION OF WHAT AN INTEREST NAME IS, IN A LEAF MODULE.
 *
 * It lived in `catalogue.cache.ts`, which is fine until something below the
 * cache needs it. `InterestNameClaimRepository` does — the claim must fold a
 * name exactly as the lookup does, or it would defend "Bouldering" while the
 * search resolved "bouldering", a constraint and a lookup disagreeing about
 * what a name is. Importing it from the cache created a cycle
 * (claim → cache → interest.repository → claim) and Nest's DI metadata came
 * back `undefined` at runtime, which presents as "can't resolve dependencies"
 * rather than as anything resembling a cycle.
 *
 * Copying the four lines into the repository would have broken the cycle and
 * re-introduced the exact defect the import existed to prevent. A leaf module
 * keeps one definition and no cycle.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHAT IT FOLDS, AND DELIBERATELY WHAT IT DOES NOT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Case, punctuation and repeated whitespace. NOT stemming, NOT plurals, NOT
 * transliteration — each is a judgement that can be wrong, and wrong here files
 * somebody's photograph under a subject they did not choose. "Glasses" is not
 * "glass".
 *
 * This is also the half that delivers "merge near-duplicates automatically":
 * "Bouldering", "bouldering" and "Bouldering!" fold to one name, so the second
 * and third never create an interest and there is nothing to merge.
 *
 * STATED LIMITATION: `[^a-z0-9]` strips every non-ASCII character, so a name in
 * a non-Latin script folds to the empty string and is refused. The product is
 * Latin-script-only for interest names. Recorded rather than discovered.
 */
export const normaliseName = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
