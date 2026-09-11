import type { Surface } from './surfaces';
import { duplicateSurfaceNames } from './surfaces';

/**
 * ===========================================================================
 * THE OVERLAY SEAM, EXERCISED WITH A NON-EMPTY OVERLAY.
 * ===========================================================================
 *
 * This file exists because of the failure mode the seam otherwise has, and it
 * is this project's most-repeated one: upstream ships an empty overlay, every
 * suite is green, and NOTHING EVER RUNS THE COMPOSED PATH. The seam would then
 * be a declared half with no other half — exactly `readAt` with no writer,
 * `avatarKey` with no writer, a "Following" tab with no feed behind it — and it
 * would rot silently, because an empty overlay cannot tell a working
 * composition apart from a broken one.
 *
 * It is also Principle V in small: a green run against the empty configuration
 * is not evidence about the configuration a fork actually builds.
 *
 * So the composition is loaded here against overlays that are NOT empty, and
 * the guarantees ../overlay/README.md promises are asserted rather than
 * described. The three refusals were each verified RED by populating the real
 * overlay and watching them fail before this file was written:
 *
 *   - an overlay surface, built, with no probe -> surface-routing names it
 *   - an overlay surface reusing a base name   -> surfaces.ts throws at import
 *   - an overlay surface of kind 'review'      -> matrix.spec refuses it
 *
 * The first and third live in the suites that own those checks. This file owns
 * the composition underneath all of them.
 */

type SurfacesModule = typeof import('./surfaces');

interface OverlayShape {
  OVERLAY_SURFACES: readonly Surface[];
  OVERLAY_EVER_BUILT: readonly string[];
}

/**
 * Load `surfaces.ts` against a substituted overlay.
 *
 * `isolateModules` gives the require a fresh registry, so each case sees its
 * own composition rather than the first one cached. The module is loaded by
 * `require` for that reason - a top-level import would bind once, before any
 * substitution, and every case would silently assert about the empty overlay.
 */
function loadSurfacesWith(overlay: OverlayShape): SurfacesModule {
  let mod!: SurfacesModule;
  jest.isolateModules(() => {
    jest.doMock('../overlay/surfaces.overlay', () => overlay);
    mod = require('./surfaces') as SurfacesModule;
  });
  return mod;
}

afterEach(() => {
  jest.dontMock('../overlay/surfaces.overlay');
  jest.resetModules();
});

const forkSurface: Surface = { name: 'fork-only feed', built: true, story: 'fork/US1' };
const forkSecond: Surface = { name: 'fork-only search', built: true, story: 'fork/US2' };

describe('the overlay seam composes', () => {
  it('an empty overlay composes to exactly the base lists', () => {
    // The upstream case, pinned. If this ever diverges, `SURFACES` has stopped
    // being `BASE_SURFACES` for a build that adds nothing - which would mean
    // every count in matrix.spec.ts is measuring something else.
    const { SURFACES, BASE_SURFACES, EVER_BUILT, BASE_EVER_BUILT } = loadSurfacesWith({
      OVERLAY_SURFACES: [],
      OVERLAY_EVER_BUILT: [],
    });
    expect(SURFACES).toEqual(BASE_SURFACES);
    expect(EVER_BUILT).toEqual(BASE_EVER_BUILT);
  });

  it('a non-empty overlay is appended to the surface list', () => {
    const { SURFACES, BASE_SURFACES } = loadSurfacesWith({
      OVERLAY_SURFACES: [forkSurface, forkSecond],
      OVERLAY_EVER_BUILT: [],
    });
    expect(SURFACES.length).toBe(BASE_SURFACES.length + 2);
    expect(SURFACES.map((s) => s.name)).toEqual([
      ...BASE_SURFACES.map((s) => s.name),
      'fork-only feed',
      'fork-only search',
    ]);
  });

  it('the ratchet composes too, so an overlay surface cannot silently stop being covered', () => {
    const { EVER_BUILT, BASE_EVER_BUILT } = loadSurfacesWith({
      OVERLAY_SURFACES: [forkSurface],
      OVERLAY_EVER_BUILT: ['fork-only feed'],
    });
    expect(EVER_BUILT).toEqual([...BASE_EVER_BUILT, 'fork-only feed']);
  });

  /**
   * 004/T128's distinction, preserved across the seam.
   *
   * A surface honestly in progress is in the surface list and NOT yet in the
   * ratchet. That must stay legal for an overlay, or a fork is forced to add a
   * name to an append-only list before the code exists - which is the false
   * alarm that turned the whole API suite red for forty unrelated tasks and is
   * why the two lists were split in the first place.
   */
  it('allows an overlay surface that is in progress - in the list, not in the ratchet', () => {
    const { SURFACES, EVER_BUILT, BASE_EVER_BUILT } = loadSurfacesWith({
      OVERLAY_SURFACES: [{ name: 'fork-only drafts', built: false, story: 'fork/US3' }],
      OVERLAY_EVER_BUILT: [],
    });
    expect(SURFACES.some((s) => s.name === 'fork-only drafts')).toBe(true);
    expect(EVER_BUILT).toEqual(BASE_EVER_BUILT);
  });

  /**
   * The collision refusal, asserted rather than described. Verified red against
   * the real overlay first: the message names `home feed` and says why.
   *
   * It throws at IMPORT, so every consumer of the list stops rather than the one
   * suite somebody remembered to put an assertion in.
   */
  it('refuses an overlay surface that reuses a base surface name', () => {
    expect(() =>
      loadSurfacesWith({
        OVERLAY_SURFACES: [{ name: 'home feed', built: true, story: 'fork/US1' }],
        OVERLAY_EVER_BUILT: [],
      }),
    ).toThrow(/duplicate surface name\(s\) in the composed list: home feed/);
  });

  it('refuses two overlay surfaces sharing a name as well', () => {
    // The base list is not the only place a collision can come from, and a check
    // that only compared against the base would pass this.
    expect(() =>
      loadSurfacesWith({
        OVERLAY_SURFACES: [forkSurface, { ...forkSurface, story: 'fork/US9' }],
        OVERLAY_EVER_BUILT: [],
      }),
    ).toThrow(/duplicate surface name\(s\) in the composed list: fork-only feed/);
  });
});

describe('duplicateSurfaceNames', () => {
  it('finds nothing in a list of distinct names', () => {
    expect(duplicateSurfaceNames([forkSurface, forkSecond])).toEqual([]);
  });

  it('reports each repeated name once, however many times it repeats', () => {
    expect(
      duplicateSurfaceNames([forkSurface, forkSecond, forkSurface, forkSurface]),
    ).toEqual(['fork-only feed']);
  });
});
