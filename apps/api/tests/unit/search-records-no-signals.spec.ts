import { join } from 'node:path';
import { forbiddenReferences, SIGNAL_AND_RANKING_IDENTIFIERS } from './support/forbidden-imports';

/**
 * 008/T087, FR-021 — A SEARCH RECORDS NO BEHAVIOURAL RANKING SIGNAL.
 *
 * The SAME check as `following-feed-is-unranked.spec.ts`, sharing one helper,
 * because FR-009 and FR-021 are literally one requirement on two surfaces:
 * neither Following nor search may train the ranked feed. Two copies of an
 * import check is two places for the comment-stripping to be got wrong, and this
 * project has been bitten in both directions.
 *
 * A DEPENDENCY check. If the module cannot reach the signal or ranking modules
 * it cannot have acquired their behaviour, and it fails when the IMPORT appears
 * rather than when a post exists to demonstrate the effect. 008/T104 verifies it
 * RED.
 *
 * Searching is a strong intent signal and it is deliberately NOT collected. A
 * person looking for a specific post is answering their own question, not
 * telling the product what to show them next — and a search that quietly
 * retrained the feed would make the one surface you use to find something
 * specific the one that most changes what you see afterwards.
 */
const SEARCH_MODULE = join(__dirname, '../../src/modules/search');

describe('008/FR-021 post search cannot rank or record', () => {
  it('no file in modules/search references the signal or ranking modules', () => {
    expect(forbiddenReferences([SEARCH_MODULE], SIGNAL_AND_RANKING_IDENTIFIERS)).toEqual([]);
  });

  it('nor reaches for the ranker\'s tuning constants', () => {
    expect(
      forbiddenReferences([SEARCH_MODULE], [
        'SIGNAL_WEIGHTS',
        'EXPLORE_EPSILON',
        'FOLLOWED_AUTHOR_BOOST_MS',
        'DECLARED_INTEREST_WEIGHT',
        'chooseExploreInterests',
      ]),
    ).toEqual([]);
  });
});
