import { VisibilityFilter, type VisibilityCandidate, type Viewer } from '../../src/visibility/visibility.filter';
import type { PersonFollowRepository } from '../../src/persistence/person-follow.repository';
import type { BlockRepository } from '../../src/persistence/block.repository';
import { EVER_BUILT, SURFACES } from './surfaces';

/**
 * ===========================================================================
 * THIS SUITE IS SC-009.
 * ===========================================================================
 *
 * Generated from contracts/visibility-matrix.md, which is a contract rather than
 * documentation, plus 004's contracts/visibility-matrix-addendum.md, which grows
 * the surface list from 7 to 11. 7 post states x 6 viewer relationships x
 * 11 surfaces = 462.
 *
 * Surfaces are enabled by the story that builds them. A surface still marked
 * `built: false` is SKIPPED, not passed - the counts printed at the end say how
 * many assertions are actually running, so a skipped surface can never be
 * mistaken for a covered one.
 *
 * WHAT THIS SUITE DOES AND DOES NOT PROVE. It proves the FILTER implements the
 * decision table. It does not prove a surface CALLS the filter - every row here
 * runs the same `decide()`, so a read path that quietly built its own predicate
 * would leave this suite green. That second half is surface-routing.spec.ts,
 * which is the one that would have caught the five times a read path in this
 * repository returned VisibilityFilter's candidates instead of using its answer.
 * Neither suite is sufficient alone, and SC-005 needs both.
 */

const AUTHOR = 'author-1';
const VIEWERS = {
  anon: null,
  self: { userId: AUTHOR },
  follower: { userId: 'follower-1' },
  stranger: { userId: 'stranger-1' },
  'blocked-by': { userId: 'blocked-by-1' },
  blocker: { userId: 'blocker-1' },
} satisfies Record<string, Viewer>;

type ViewerKey = keyof typeof VIEWERS;

const POST_STATES = {
  'public, ready': { visibility: 'public', processingState: 'ready' },
  'followers, ready': { visibility: 'followers', processingState: 'ready' },
  'private, ready': { visibility: 'private', processingState: 'ready' },
  'not ready': { visibility: 'public', processingState: 'processing' },
  'soft-deleted': { visibility: 'public', processingState: 'ready', deletedAt: '2026-01-01T00:00:00Z' },
  'author not active': { visibility: 'public', processingState: 'ready', authorStatus: 'deleting' },
  'removed by moderation': { visibility: 'public', processingState: 'ready', removedByModeration: true },
} as const satisfies Record<string, Partial<VisibilityCandidate>>;

type StateKey = keyof typeof POST_STATES;

/** The decision table from contracts/visibility-matrix.md. true = returned. */
const EXPECTED: Record<StateKey, Record<ViewerKey, boolean>> = {
  'public, ready':         { anon: true,  self: true, follower: true,  stranger: true,  'blocked-by': false, blocker: false },
  'followers, ready':      { anon: false, self: true, follower: true,  stranger: false, 'blocked-by': false, blocker: false },
  'private, ready':        { anon: false, self: true, follower: false, stranger: false, 'blocked-by': false, blocker: false },
  'not ready':             { anon: false, self: true, follower: false, stranger: false, 'blocked-by': false, blocker: false },
  'soft-deleted':          { anon: false, self: false, follower: false, stranger: false, 'blocked-by': false, blocker: false },
  'author not active':     { anon: false, self: false, follower: false, stranger: false, 'blocked-by': false, blocker: false },
  'removed by moderation': { anon: false, self: false, follower: false, stranger: false, 'blocked-by': false, blocker: false },
};

// The surface list lives in surfaces.ts so this suite and surface-routing.spec.ts
// cannot drift. See that file for why.


function buildFilter(): VisibilityFilter {
  const follows = {
    isFollowing: async (followerId: string, followeeId: string) =>
      followerId === VIEWERS.follower.userId && followeeId === AUTHOR,
  } as unknown as PersonFollowRepository;

  const blocks = {
    existsBetween: async (a: string, b: string) => {
      const pair = [a, b];
      return (
        (pair.includes(VIEWERS['blocked-by'].userId) && pair.includes(AUTHOR)) ||
        (pair.includes(VIEWERS.blocker.userId) && pair.includes(AUTHOR))
      );
    },
  } as unknown as BlockRepository;

  return new VisibilityFilter(follows, blocks);
}

// Every POST_STATES entry sets visibility and processingState itself, so no
// defaults are supplied for them - a default here would be silently overwritten.
const candidate = (state: StateKey): VisibilityCandidate => ({
  postId: 'post-1',
  authorId: AUTHOR,
  authorStatus: 'active',
  ...POST_STATES[state],
});

let assertionsRun = 0;
const skippedSurfaces: string[] = [];

describe('SC-009 visibility matrix', () => {
  const filter = buildFilter();

  for (const surface of SURFACES.filter((s) => (s.kind ?? 'post') === 'post')) {
    const run = surface.built ? describe : describe.skip;
    if (!surface.built) skippedSurfaces.push(`${surface.name} (built by ${surface.story})`);

    run(`surface: ${surface.name}`, () => {
      for (const state of Object.keys(POST_STATES) as StateKey[]) {
        for (const viewerKey of Object.keys(VIEWERS) as ViewerKey[]) {
          const expected = EXPECTED[state][viewerKey];
          it(`${state} / ${viewerKey} -> ${expected ? 'visible' : 'hidden'}`, async () => {
            const decision = await filter.decide(
              VIEWERS[viewerKey],
              candidate(state),
              filter.newRequestCache(),
            );
            expect(decision.visible).toBe(expected);
            assertionsRun++;
          });
        }
      }
    });
  }

  afterAll(() => {
    const perSurface = Object.keys(POST_STATES).length * Object.keys(VIEWERS).length;
    const postSurfaces = SURFACES.filter((s) => (s.kind ?? 'post') === 'post');
    const built = postSurfaces.filter((s) => s.built).length;
    console.log(
      `\n001/SC-009 + 004/SC-005: ${assertionsRun}/${perSurface * postSurfaces.length} post assertions run ` +
        `(${built}/${postSurfaces.length} post surfaces built).\n` +
        `Not yet built: ${skippedSurfaces.join(', ') || 'none - every enumerated surface is covered'}\n`,
    );
  });

  /**
   * 004/T128. Now that every surface is built, an unbuilt one is a REGRESSION.
   *
   * While the feature was in progress a `built: false` row was correct - it made
   * the gap visible instead of letting a skipped surface read as a covered one.
   * Both criteria are now closed, so the same row would mean a surface stopped
   * being covered, and the suite would report that as 420 green assertions.
   *
   * This is the difference between a progress marker and a ratchet.
   */
  /**
   * THE RATCHET: a surface that has ever been covered must still be covered.
   *
   * This is the failure 004/T128 was written for - a row flipping to
   * `built: false` and the suite reporting 420 green assertions as though
   * nothing were wrong. It fails here instead, and it names the surface.
   */
  it('no surface that was ever covered has stopped being covered', () => {
    const regressed = EVER_BUILT.filter((name) => !SURFACES.find((s) => s.name === name)?.built);
    expect(regressed).toEqual([]);
  });

  /**
   * And the count must match the surfaces claiming coverage - so a surface
   * cannot be marked built while contributing no assertions.
   */
  it('every built post surface contributes its full set of assertions', () => {
    const built = SURFACES.filter((s) => (s.kind ?? 'post') === 'post' && s.built).length;
    expect(assertionsRun).toBe(
      Object.keys(POST_STATES).length * Object.keys(VIEWERS).length * built,
    );
  });

  /**
   * SC-009 and SC-005 are closed only when nothing is left in progress. Reported
   * rather than asserted while a feature is being built: an in-progress surface
   * is a known gap, and a red suite for forty unrelated tasks is how a signal
   * stops being read. The regression check above is what must never be soft.
   */
  it('reports any surface still in progress', () => {
    const pending = SURFACES.filter((s) => !s.built).map((s) => `${s.name} (${s.story})`);
    if (pending.length > 0) {
      console.log(`\n  SURFACES NOT YET COVERED - SC-005 is NOT closed: ${pending.join(', ')}\n`);
    }
    expect(pending.every((p) => !EVER_BUILT.includes(p.split(' (')[0]!))).toBe(true);
  });
});

/**
 * ===========================================================================
 * THE REVIEW DECISION TABLE (005/US2)
 * ===========================================================================
 *
 * From contracts/visibility-matrix-addendum.md § 2, which is a contract. Written
 * BEFORE the review read path exists (plan gate G4), so it fails until T050.
 *
 * A SMALLER TABLE, AND THAT IS THE POINT. A review has no audience setting - it
 * is as visible as the place page it sits on - so there is no `followers` or
 * `private` row to evaluate. 4 states x 4 viewers, plus the two blocking
 * directions, is the whole of it.
 *
 * Running the POST table here instead would have been the easy mistake: 7 post
 * states x 6 viewers against a thing with neither a visibility setting nor a
 * processing state. It would have passed, because `decide()` answers for any
 * candidate you hand it, and the count would have read 504 and meant nothing.
 * That is why `Surface.kind` exists.
 */
const REVIEW_AUTHOR = 'review-author-1';

const REVIEW_VIEWERS = {
  anonymous: null,
  author: { userId: REVIEW_AUTHOR },
  other: { userId: 'review-other-1' },
  operator: { userId: 'review-operator-1', isOperator: true },
} satisfies Record<string, Viewer>;

type ReviewViewerKey = keyof typeof REVIEW_VIEWERS;

const REVIEW_STATES = {
  live: {},
  removed: { removedByModeration: true },
  'author-deleting': { authorStatus: 'deleting' as const },
  'author-deleted': { authorStatus: 'deleted' as const },
};

type ReviewStateKey = keyof typeof REVIEW_STATES;

/**
 * Two rows deserve their reasons restated here, because both are places a
 * reasonable person would implement the opposite:
 *
 *  - `removed` is gone to its OWN AUTHOR. A moderated review its author can
 *    still see reads as "the removal did not work" and invites a second
 *    submission. They learn of it through the notification FR-015 sends.
 *  - `removed` is gone to an OPERATOR too. A moderator reviewing a decision
 *    reads the append-only log, which survives the content; making removed
 *    content visible on the product surface would be a second, weaker
 *    moderation view.
 */
const REVIEW_EXPECTED: Record<ReviewStateKey, Record<ReviewViewerKey, boolean>> = {
  live: { anonymous: true, author: true, other: true, operator: true },
  removed: { anonymous: false, author: false, other: false, operator: false },
  'author-deleting': { anonymous: false, author: false, other: false, operator: false },
  'author-deleted': { anonymous: false, author: false, other: false, operator: false },
};

let reviewAssertionsRun = 0;

describe('SC-005 review visibility (005 addendum)', () => {
  const reviewSurface = SURFACES.find((s) => s.kind === 'review');
  const run = reviewSurface?.built ? describe : describe.skip;

  run('surface: place reviews', () => {
    const build = () => {
      const filter = buildFilter();
      const { AuthoredContentVisibility } = jest.requireActual<
        typeof import('../../src/visibility/authored-content')
      >('../../src/visibility/authored-content');
      return new AuthoredContentVisibility(filter);
    };

    for (const state of Object.keys(REVIEW_STATES) as ReviewStateKey[]) {
      for (const viewerKey of Object.keys(REVIEW_VIEWERS) as ReviewViewerKey[]) {
        const expected = REVIEW_EXPECTED[state][viewerKey];
        it(`${state} / ${viewerKey} -> ${expected ? 'visible' : 'hidden'}`, async () => {
          const visibility = build();
          const decision = await visibility.decide(
            REVIEW_VIEWERS[viewerKey],
            { authorId: REVIEW_AUTHOR, ...REVIEW_STATES[state] },
            visibility.newRequestCache(),
          );
          expect(decision.visible).toBe(expected);
          reviewAssertionsRun++;
        });
      }
    }

    /**
     * FR-013 and SC-004. BOTH DIRECTIONS, ASSERTED SEPARATELY.
     *
     * A single-direction check passes against an implementation that only looks
     * one way - which is a real and asymmetric leak: "people I blocked cannot
     * see my reviews" and "I cannot see reviews by people who blocked me" are
     * different guarantees, and shipping one of them looks exactly like
     * shipping both.
     */
    it('a review by somebody the viewer has blocked is gone', async () => {
      const visibility = build();
      const decision = await visibility.decide(
        { userId: 'blocker-1' },
        { authorId: AUTHOR },
        visibility.newRequestCache(),
      );
      expect(decision.visible).toBe(false);
      reviewAssertionsRun++;
    });

    it('a review by somebody who has blocked the viewer is gone', async () => {
      const visibility = build();
      const decision = await visibility.decide(
        { userId: 'blocked-by-1' },
        { authorId: AUTHOR },
        visibility.newRequestCache(),
      );
      expect(decision.visible).toBe(false);
      reviewAssertionsRun++;
    });
  });

  afterAll(() => {
    const expectedReview = Object.keys(REVIEW_STATES).length * Object.keys(REVIEW_VIEWERS).length + 2;
    console.log(
      `\n005/SC-005: ${reviewAssertionsRun}/${expectedReview} review assertions run ` +
        `(place reviews ${reviewSurface?.built ? 'built' : 'NOT YET BUILT'}).\n`,
    );
  });

  /**
   * The combined number SC-005 is about: 462 post assertions + 18 review ones.
   * Asserted only once the review surface is built, so an in-progress feature
   * reports a gap rather than turning the suite red for forty unrelated tasks.
   */
  it('reports the combined SC-005 total', () => {
    if (!reviewSurface?.built) {
      console.log('\n  SC-005 is NOT closed: the review surface is still in progress.\n');
      return;
    }
    expect(assertionsRun + reviewAssertionsRun).toBe(480);
  });
});
