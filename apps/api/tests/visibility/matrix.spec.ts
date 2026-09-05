import { VisibilityFilter, type VisibilityCandidate, type Viewer } from '../../src/visibility/visibility.filter';
import type { PersonFollowRepository } from '../../src/persistence/person-follow.repository';
import type { BlockRepository } from '../../src/persistence/block.repository';

/**
 * ===========================================================================
 * THIS SUITE IS SC-009.
 * ===========================================================================
 *
 * Generated from contracts/visibility-matrix.md, which is a contract rather than
 * documentation. 7 post states x 6 viewer relationships x 7 surfaces.
 *
 * Surfaces are enabled by the story that builds them. A surface still marked
 * `built: false` is SKIPPED, not passed - the counts printed at the end say how
 * many assertions are actually running, so a skipped surface can never be
 * mistaken for a covered one. T154 turns on the last surface and closes SC-009.
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

/** FR-018 enumerates these. Each is a distinct code path that could leak. */
const SURFACES = [
  // Built by US1: PostQueryService.listByInterest and .listByAuthor both route
  // through VisibilityFilter - see tests/integration/us1-publish.spec.ts, which
  // asserts the HTTP surfaces call them.
  { name: 'interest space',   built: true,  story: 'US1 (T063)' },
  { name: 'profile',          built: true,  story: 'US1 (T063)' },
  // Built by US2: the interest listing goes through PostQueryService.listByInterest,
  // and interest search returns no post content of its own - post counts come
  // from the same filtered path. See tests/integration/us2-discover.spec.ts.
  { name: 'interest search',  built: true,  story: 'US2 (T082)' },
  { name: 'home feed',        built: false, story: 'US3 (T098)' },
  { name: 'share link',       built: false, story: 'US5 (T122)' },
  { name: 'comments',         built: false, story: 'US5 (T122)' },
  { name: 'notifications',    built: false, story: 'T154 - closes SC-009' },
] as const;

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

  for (const surface of SURFACES) {
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
    const built = SURFACES.filter((s) => s.built).length;
    // eslint-disable-next-line no-console
    console.log(
      `\nSC-009: ${assertionsRun}/${perSurface * SURFACES.length} assertions run ` +
        `(${built}/${SURFACES.length} surfaces built).\n` +
        `Not yet built: ${skippedSurfaces.join(', ') || 'none - SC-009 is closed'}\n`,
    );
  });
});
