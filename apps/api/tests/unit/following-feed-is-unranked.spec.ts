import { join } from 'node:path';
import { forbiddenReferences, SIGNAL_AND_RANKING_IDENTIFIERS } from './support/forbidden-imports';

/**
 * 008/T037, FR-009 — THE FOLLOWING SURFACE RECORDS NOTHING AND RANKS NOTHING.
 *
 * Enforces `specs/008-post-reach-and-depth/contracts/following-feed.md`.
 *
 * Following exists to be the PREDICTABLE alternative to the ranked feed:
 * chronological, unranked, and — the part that is easy to lose — not a source of
 * behavioural signal. If reading it moved the ranker's weights, choosing the
 * unranked surface would still train the ranked one, and a person who preferred
 * Following would have no way to stop feeding a feed they were avoiding.
 *
 * A DEPENDENCY CHECK. If the service cannot reach the signal or ranking modules,
 * it cannot have acquired their behaviour, whatever anyone intended. It fails
 * when the IMPORT appears — before any post exists that would demonstrate the
 * effect. The behavioural half is
 * `tests/integration/following-records-no-signals.spec.ts`, and neither is
 * sufficient alone: a structural guard says the dependency is absent, never that
 * the behaviour is right.
 *
 * Same shape as `feed-does-not-read-place-follows.spec.ts` — which 007 had to
 * WIDEN when the selection path moved out of `feed.service.ts`, because the old
 * guard was watching a file the violation no longer had to live in. If the
 * Following feed ever moves, this moves with it.
 */
const SERVICE = join(__dirname, '../../src/modules/feed/following-feed.service.ts');

describe('008/FR-009 the Following feed cannot rank or record', () => {
  it('does not reference the signal or ranking modules', () => {
    expect(forbiddenReferences([SERVICE], SIGNAL_AND_RANKING_IDENTIFIERS)).toEqual([]);
  });

  /**
   * The ranked feed's own constants, checked separately from the modules above.
   *
   * A service that imported no ranking class but reached for
   * `FOLLOWED_AUTHOR_BOOST_MS` would be ordering by something other than time
   * while passing the check above — and a followed-author boost on a surface
   * where EVERY author is followed is meaningless as well as forbidden.
   */
  it('does not reach for the ranker\'s tuning constants', () => {
    expect(
      forbiddenReferences([SERVICE], [
        'FOLLOWED_AUTHOR_BOOST_MS',
        'DECLARED_INTEREST_WEIGHT',
        'EXPLORE_EPSILON',
        'SIGNAL_WEIGHTS',
        'chooseExploreInterests',
        'decay',
      ]),
    ).toEqual([]);
  });
});
