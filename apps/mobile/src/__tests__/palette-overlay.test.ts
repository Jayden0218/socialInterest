import { contrastRatio } from '../ui/color';
import { baseDark, baseLight, dark, light, type Palette } from '../ui/tokens';
import { OVERLAY_PALETTES } from '../overlay/palette';
import { activePalette } from '../ui/theme';

/**
 * ===========================================================================
 * A FORK'S PALETTE IS HELD TO THE SAME FLOOR.
 * ===========================================================================
 *
 * `OVERLAY_PALETTES` is empty upstream, so `light === baseLight` here forever
 * and the override path is never once exercised by an ordinary run. That is the
 * declared-half-with-no-other-half shape this repository keeps finding, so the
 * resolution is driven below with a NON-EMPTY overlay.
 *
 * The assertion that matters is not "the override works" — it is that the
 * ACCESSIBILITY GUARANTEE TRAVELS WITH IT. `contrast.test.ts` imports
 * `light`/`dark` from `ui/tokens`, which is why the overlay resolves in
 * `tokens.ts` rather than in `theme.ts` where `activePalette` lives: an
 * override one level up would have left a fork's colours rendering in the app
 * while every contrast check still measured upstream's. Two sources of truth
 * for one fact — 006's "white cards inside dark green chrome", by another route.
 */

type PaletteModule = typeof import('../ui/tokens');

function loadTokensWith(overlay: { light?: Palette; dark?: Palette }): PaletteModule {
  let mod!: PaletteModule;
  jest.isolateModules(() => {
    jest.doMock('../overlay/palette', () => ({ OVERLAY_PALETTES: overlay }));
    mod = require('../ui/tokens') as PaletteModule;
  });
  return mod;
}

afterEach(() => {
  jest.dontMock('../overlay/palette');
  jest.resetModules();
});

/** A palette that renders but is illegible: muted grey on near-white. */
const illegible: Palette = {
  ...baseLight,
  text: { ...baseLight.text, muted: '#C9CFCB', secondary: '#BFC6C1' },
};

describe('the palette overlay', () => {
  it('is empty in this repository', () => {
    // Upstream's promise. A palette accidentally committed here would re-brand
    // everyone's build.
    expect(OVERLAY_PALETTES).toEqual({});
  });

  it('an empty overlay resolves to this repository\'s palettes', () => {
    const tokens = loadTokensWith({});
    expect(tokens.light).toBe(tokens.baseLight);
    expect(tokens.dark).toBe(tokens.baseDark);
  });

  it('a supplied light palette replaces it', () => {
    const mine: Palette = { ...baseLight, intent: { ...baseLight.intent, accent: '#7A3FB0' } };
    const tokens = loadTokensWith({ light: mine });
    expect(tokens.light.intent.accent).toBe('#7A3FB0');
    // And only that one: an overlay supplying `light` alone must not blank dark.
    expect(tokens.dark).toBe(tokens.baseDark);
  });

  it('a supplied dark palette replaces it independently', () => {
    const mine: Palette = { ...baseDark, intent: { ...baseDark.intent, accent: '#9BE8B4' } };
    const tokens = loadTokensWith({ dark: mine });
    expect(tokens.dark.intent.accent).toBe('#9BE8B4');
    expect(tokens.light).toBe(tokens.baseLight);
  });

  /**
   * ONE SOURCE OF TRUTH, asserted rather than trusted.
   *
   * 41 screens read the palette through `ui/theme`; the guards read it from
   * `ui/tokens`. If those two ever resolve separately the app and its
   * accessibility checks are looking at different colours, which is the exact
   * defect the resolution point was chosen to prevent.
   */
  it('ui/theme and ui/tokens are the same palette object', () => {
    expect(activePalette).toBe(light);
    expect(light).toBe(baseLight);
    expect(dark).toBe(baseDark);
  });
});

/**
 * THE FLOOR ITSELF. Same rule `contrast.test.ts` applies, run against an
 * overlay palette.
 *
 * Verified in both directions on purpose: an assertion that a bad palette fails
 * proves nothing unless a good one passes, and vice versa. Without the second
 * half this would also pass against a check that rejected everything.
 */
describe('the contrast floor applies to an overlay palette', () => {
  const AA_BODY = 4.5;

  const worstTextContrast = (p: Palette): number =>
    Math.min(
      ...[p.text.primary, p.text.secondary, p.text.muted].flatMap((fg) =>
        [p.bg.base, p.bg.raised, p.bg.sunken].map((bg) => contrastRatio(fg, bg)),
      ),
    );

  it('this repository\'s palette clears AA for body text', () => {
    expect(worstTextContrast(loadTokensWith({}).light)).toBeGreaterThanOrEqual(AA_BODY);
  });

  it('an illegible overlay palette does NOT clear it', () => {
    // The point: a fork cannot re-brand its way under the floor without the
    // suite that enforces the floor going red, because that suite reads the
    // same resolved `light` this does.
    expect(worstTextContrast(loadTokensWith({ light: illegible }).light)).toBeLessThan(AA_BODY);
  });

  it('and the resolved palette really is the overlay\'s, not a copy of the base', () => {
    // Guards the guard: if the override silently did nothing, the test above
    // would be measuring `baseLight` and reporting a pass for the wrong reason.
    expect(loadTokensWith({ light: illegible }).light.text.muted).toBe(illegible.text.muted);
  });
});
