import { VisibilityFilter, type VisibilityCandidate, type Viewer } from '../../src/visibility/visibility.filter';
import type { PersonFollowRepository } from '../../src/persistence/person-follow.repository';
import type { BlockRepository } from '../../src/persistence/block.repository';
import type { PersonRepository } from '../../src/persistence/person.repository';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { BASE_EVER_BUILT, BASE_SURFACES, EVER_BUILT, SURFACES } from './surfaces';
import { OVERLAY_SURFACES } from '../overlay/surfaces.overlay';

/**
 * ===========================================================================
 * THIS SUITE IS SC-009.
 * ===========================================================================
 *
 * Generated from contracts/visibility-matrix.md, which is a contract rather than
 * documentation, plus 004's contracts/visibility-matrix-addendum.md and 008's
 * contracts/visibility-matrix-delta.md.
 *
 * 008/US13 adds TWO dimensions at once: a `pending-follower` relationship and an
 * author-privacy axis. 7 post states x 7 viewer relationships x 2 privacy
 * settings x 13 surfaces, and the private half is a full table rather than a
 * handful of extra cases, because "only one row changes" is a CLAIM about the
 * implementation and this suite is where it has to be true.
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
  /**
   * 008/FR-043. HAS A FOLLOW ROW AND IS NOT A FOLLOWER.
   *
   * Enumerated separately because the obvious mistake is to treat the EXISTENCE
   * of a follow row as a follow, and a row in state `pending` is exactly that
   * trap. Every expectation below puts this viewer where `stranger` is.
   */
  'pending-follower': { userId: 'pending-follower-1' },
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
  'public, ready':         { anon: true,  self: true, follower: true,  'pending-follower': true,  stranger: true,  'blocked-by': false, blocker: false },
  'followers, ready':      { anon: false, self: true, follower: true,  'pending-follower': false, stranger: false, 'blocked-by': false, blocker: false },
  'private, ready':        { anon: false, self: true, follower: false, 'pending-follower': false, stranger: false, 'blocked-by': false, blocker: false },
  'not ready':             { anon: false, self: true, follower: false, 'pending-follower': false, stranger: false, 'blocked-by': false, blocker: false },
  'soft-deleted':          { anon: false, self: false, follower: false, 'pending-follower': false, stranger: false, 'blocked-by': false, blocker: false },
  'author not active':     { anon: false, self: false, follower: false, 'pending-follower': false, stranger: false, 'blocked-by': false, blocker: false },
  'removed by moderation': { anon: false, self: false, follower: false, 'pending-follower': false, stranger: false, 'blocked-by': false, blocker: false },
};

/**
 * 008/FR-044 — THE SAME TABLE WITH A PRIVATE AUTHOR, from the delta contract §2.
 *
 * Written out in full rather than derived, because a derived table proves
 * whatever its derivation assumes. The assertion below then checks that this
 * hand-written table IS the open one with a single row replaced — which is the
 * evidence that account privacy was one clause and not a second predicate. If
 * somebody later implements privacy per surface, this suite goes red in the
 * derivation check even if every row still passes.
 */
const EXPECTED_PRIVATE_AUTHOR: Record<StateKey, Record<ViewerKey, boolean>> = {
  'public, ready':         { anon: false, self: true, follower: true,  'pending-follower': false, stranger: false, 'blocked-by': false, blocker: false },
  'followers, ready':      { anon: false, self: true, follower: true,  'pending-follower': false, stranger: false, 'blocked-by': false, blocker: false },
  'private, ready':        { anon: false, self: true, follower: false, 'pending-follower': false, stranger: false, 'blocked-by': false, blocker: false },
  'not ready':             { anon: false, self: true, follower: false, 'pending-follower': false, stranger: false, 'blocked-by': false, blocker: false },
  'soft-deleted':          { anon: false, self: false, follower: false, 'pending-follower': false, stranger: false, 'blocked-by': false, blocker: false },
  'author not active':     { anon: false, self: false, follower: false, 'pending-follower': false, stranger: false, 'blocked-by': false, blocker: false },
  'removed by moderation': { anon: false, self: false, follower: false, 'pending-follower': false, stranger: false, 'blocked-by': false, blocker: false },
};

const PRIVACY = ['open', 'private'] as const;
type PrivacyKey = (typeof PRIVACY)[number];

const TABLE: Record<PrivacyKey, Record<StateKey, Record<ViewerKey, boolean>>> = {
  open: EXPECTED,
  private: EXPECTED_PRIVATE_AUTHOR,
};

/**
 * The size of one post surface's block of assertions, derived from the tables
 * above rather than written down. 7 states x 7 viewers x 2 privacy settings.
 *
 * Derived on purpose: the counts below are about HOW MANY SURFACES run, and a
 * second hand-written copy of the table dimensions is a number that can disagree
 * with the tables it is counting.
 */
const ASSERTIONS_PER_POST_SURFACE =
  Object.keys(POST_STATES).length * Object.keys(VIEWERS).length * PRIVACY.length;

const postSurfacesIn = (list: readonly { kind?: string; built: boolean }[]) =>
  list.filter((s) => (s.kind ?? 'post') === 'post');

// The surface list lives in surfaces.ts so this suite and surface-routing.spec.ts
// cannot drift. See that file for why.


function buildFilter(authorPrivacy: PrivacyKey = 'open'): VisibilityFilter {
  const follows = {
    /**
     * The PENDING follower is deliberately absent here, because the real
     * repository answers this question from the row's state and returns false
     * for a pending one. A stub that returned true would be testing a follow
     * repository this product does not have.
     */
    isFollowing: async (followerId: string, followeeId: string) =>
      followerId === VIEWERS.follower.userId && followeeId === AUTHOR,
  } as unknown as PersonFollowRepository;

  const people = {
    findById: async (userId: string) =>
      userId === AUTHOR ? { userId, accountPrivacy: authorPrivacy } : null,
  } as unknown as PersonRepository;

  const blocks = {
    existsBetween: async (a: string, b: string) => {
      const pair = [a, b];
      return (
        (pair.includes(VIEWERS['blocked-by'].userId) && pair.includes(AUTHOR)) ||
        (pair.includes(VIEWERS.blocker.userId) && pair.includes(AUTHOR))
      );
    },
  } as unknown as BlockRepository;

  return new VisibilityFilter(follows, blocks, people);
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
  const filters: Record<PrivacyKey, VisibilityFilter> = {
    open: buildFilter('open'),
    private: buildFilter('private'),
  };

  for (const surface of SURFACES.filter((s) => (s.kind ?? 'post') === 'post')) {
    const run = surface.built ? describe : describe.skip;
    if (!surface.built) skippedSurfaces.push(`${surface.name} (built by ${surface.story})`);

    run(`surface: ${surface.name}`, () => {
      for (const privacy of PRIVACY) {
        const filter = filters[privacy];
        for (const state of Object.keys(POST_STATES) as StateKey[]) {
          for (const viewerKey of Object.keys(VIEWERS) as ViewerKey[]) {
            const expected = TABLE[privacy][state][viewerKey];
            it(`author ${privacy} / ${state} / ${viewerKey} -> ${expected ? 'visible' : 'hidden'}`, async () => {
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
      }
    });
  }

  afterAll(() => {
    const perSurface =
      Object.keys(POST_STATES).length * Object.keys(VIEWERS).length * PRIVACY.length;
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
  /**
   * 008/FR-044 — THE PRIVATE TABLE IS THE OPEN ONE WITH ONE ROW REPLACED.
   *
   * Not a restatement of the tables: it is the claim the implementation makes.
   * A private author's `public` post is evaluated by the `followers` rule, so
   * the private table must equal the open table with `public, ready` replaced
   * by `followers, ready` and NOTHING else touched. Anything more is a second
   * predicate, whatever the individual rows say.
   */
  it('account privacy changes exactly one row of the decision table', () => {
    const derived = Object.fromEntries(
      (Object.keys(EXPECTED) as StateKey[]).map((state) => [
        state,
        state === 'public, ready' ? EXPECTED['followers, ready'] : EXPECTED[state],
      ]),
    );
    expect(EXPECTED_PRIVATE_AUTHOR).toEqual(derived);
  });

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
      Object.keys(POST_STATES).length * Object.keys(VIEWERS).length * PRIVACY.length * built,
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
   * =========================================================================
   * 007/FR-013, SC-007 — ONE PERSON'S SIGNALS ARE ON NO SURFACE.
   * =========================================================================
   *
   * This is plan gate G5, and it is deliberately NOT a row-per-surface loop
   * like everything above it.
   *
   * A per-surface loop would need a hand-written map from each of the twelve
   * names in `surfaces.ts` to the class that answers it — and a hand-picked map
   * only ever covers the surfaces somebody remembered, which is the exact
   * failure `auth-surface.spec.ts` was written after making twice. Worse, the
   * thirteenth surface would be uncovered by silence rather than by a failure.
   *
   * So the claim is made once, over the whole tree: NOTHING outside the two
   * modules that own signals can reach the signal store. A surface cannot leak
   * what it has no way to read, and this holds for surfaces that do not exist
   * yet. The behavioural half — that real responses carry no signal data — is
   * `signals-hostile-client.spec.ts` case 4, driven over HTTP as Principle III
   * requires.
   */
  describe('007/SC-007 — nothing outside signals/ and ranking/ can read a person\'s signals', () => {
    const SRC = resolve(__dirname, '../../src');
    /**
     * The two owners. `signals/` writes them and renders the person's OWN
     * disclosure; `ranking/` reads them to order that same person's feed.
     * Everything else — every read path in the visibility matrix above, every
     * profile, every notification — has no business with them.
     */
    const ALLOWED = ['modules/signals/', 'modules/ranking/', 'persistence/'];

    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
      );

    it('no other module imports SignalRepository', () => {
      const offenders = walk(SRC)
        .filter((f) => !ALLOWED.some((a) => f.replace(SRC + '/', '').startsWith(a)))
        .filter((f) => {
          // Comments stripped, for the reason this repository has learned three
          // times: a comment naming the forbidden identifier makes correct code
          // fail, and prose describes the intention rather than the build.
          const src = readFileSync(f, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, ' ')
            .replace(/(^|[^:])\/\/.*$/gm, '$1');
          return /SignalRepository|signalProfile|signalEvent/.test(src);
        })
        .map((f) => f.replace(SRC + '/', ''));
      expect(offenders).toEqual([]);
    });

    it('and the surface list is fully covered by that claim', () => {
      // Stated so the count is legible next to the total below: this is ONE
      // assertion standing for every surface, not thirteen skipped ones.
      //
      // 12 -> 13 (008/US3's Following feed) -> 14 (008/US6's post search).
      // Raising this number is a
      // DELIBERATE, reviewable edit and is meant to be: a surface added without
      // touching it fails here, which is the only thing stopping the enumeration
      // silently falling behind the product.
      //
      // PINNED AGAINST THE BASE LIST, not the composed one. The deliberate-edit
      // property is the point and is unchanged - this literal is still the thing
      // somebody has to raise to add a surface HERE. What it no longer does is
      // collide with a downstream fork raising it for a surface of their own:
      // theirs lands in ../overlay/ and is counted below. See ../overlay/README.md.
      expect(BASE_SURFACES.length).toBe(16);
      expect(BASE_EVER_BUILT.length).toBe(16);
      // And the composed list really is base plus overlay - so an overlay that
      // dropped or duplicated an entry cannot pass the two checks above.
      //
      // Deliberately NOT `EVER_BUILT.length === 16 + OVERLAY_SURFACES.length`:
      // a surface honestly in progress is in the surface list and NOT yet in the
      // ratchet, and 004/T128 split those two lists apart precisely so that case
      // is not a failure. The overlay's ratchet is its own size.
      expect(SURFACES.length).toBe(BASE_SURFACES.length + OVERLAY_SURFACES.length);
    });
  });

  /**
   * The combined number SC-005 is about.
   *
   * 462 + 18 = 480 through 005. 008 adds three POST surfaces - the Following
   * feed (US3), post search (US6) and comment replies (US7) - and then US13 adds
   * TWO DIMENSIONS to every one of them: a `pending-follower` relationship and
   * the author-privacy axis. Phase E then adds a collection's posts as the
   * fifteenth POST surface: 15 x 7 states x 7 viewers x 2 privacy settings =
   * 1,470, plus the same 18 review assertions = 1,488.
   *
   * The jump from 606 to 1,390 is the axis, not new surfaces, and it is the
   * shape this project keeps relearning: a rule that changes the answer on every
   * surface has to be asserted on every surface, or "it is one clause" is a
   * claim rather than a measurement.
   *
   * Asserted only once the review surface is built, so an in-progress feature
   * reports a gap rather than turning the suite red for forty unrelated tasks.
   *
   * The number rising is the point. A bigger green number is NOT the goal on its
   * own - 004 recorded that 462 assertions all running the same `decide()` would
   * mean one function tested 66 times - which is why `surface-routing.spec.ts`
   * demands a probe proving each surface CONSULTS the boundary before it may
   * count here.
   */
  it('reports the combined SC-005 total', () => {
    if (!reviewSurface?.built) {
      console.log('\n  SC-005 is NOT closed: the review surface is still in progress.\n');
      return;
    }

    const reviewAssertions =
      Object.keys(REVIEW_STATES).length * Object.keys(REVIEW_VIEWERS).length + 2;

    /**
     * THIS REPOSITORY'S NUMBER, still pinned as a literal.
     *
     * Derived from the base surface list so the literal can be checked against
     * something rather than restated: 15 built post surfaces x 98 + 18 = 1,488.
     * Raising it is exactly as deliberate an edit as it was before.
     */
    const baseTotal =
      postSurfacesIn(BASE_SURFACES).filter((s) => s.built).length * ASSERTIONS_PER_POST_SURFACE +
      reviewAssertions;
    expect(baseTotal).toBe(1488);

    /**
     * AND WHAT THIS BUILD ACTUALLY RAN: base plus the overlay's contribution.
     * Upstream's overlay is empty, so this is the same 1,488 assertion it always
     * was. A fork adding two post surfaces expects 1,684 without touching this
     * file. See ../overlay/README.md.
     */
    const overlayTotal =
      postSurfacesIn(OVERLAY_SURFACES).filter((s) => s.built).length * ASSERTIONS_PER_POST_SURFACE;
    expect(assertionsRun + reviewAssertionsRun).toBe(baseTotal + overlayTotal);
  });

  /**
   * AN OVERLAY REVIEW SURFACE WOULD BE SILENTLY UNCOVERED, SO REFUSE ONE.
   *
   * The review block above resolves its surface with `find(s => s.kind ===
   * 'review')` - singular. A second review-kind surface would never be run, and
   * it would contribute 0 to both the actual and the expected count, so the
   * total above would still balance and the matrix would report green over a
   * surface it had never asserted. That is the "a surface that looks covered"
   * failure arriving through the enumeration.
   *
   * Post surfaces are what this seam supports. Adding a review-kind surface
   * means generalising the review block to loop, exactly as the post block does
   * - and this failure is what says so, instead of silence.
   */
  it('refuses an overlay review surface, which the review block would not run', () => {
    const overlayReviews = OVERLAY_SURFACES.filter((s) => s.kind === 'review').map((s) => s.name);
    expect(overlayReviews).toEqual([]);
  });
});
