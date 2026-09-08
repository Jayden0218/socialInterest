import { contrastRatio } from '../ui/color';
import { dark, light, type Palette } from '../ui/tokens';
import { everyInterestColour } from '../ui/interest-colour';

/**
 * 006/SC-004, FR-015. Accessibility is not a matter of opinion, so it is not
 * checked by looking at screenshots.
 *
 * The interest palette is GENERATED from a hash, so checking the interests that
 * happen to exist today would be a guard that answers nothing - the same shape
 * as a fixture asserting a search the flow never runs. The generator's output
 * space is 360 hues x 2 depths and finite, so this checks all of it.
 */
const AA_BODY = 4.5;
const AA_LARGE = 3;

const palettes: [string, Palette][] = [
  ['dark', dark],
  ['light', light],
];

/**
 * 006/T035, FR-017. EVERY TOKEN EXISTS IN BOTH PALETTES.
 *
 * A token defined in only one is a build failure, not a fallback. The failure it
 * prevents is specific and silent: a colour missing from the dark palette
 * resolves to `undefined`, react-native drops the style, and the element
 * inherits - which for text is the platform's black, on a near-black surface.
 * That is exactly the defect the post caption shipped with, arriving by a
 * different route.
 */
describe('both palettes are complete', () => {
  const shape = (p: Palette): string[] =>
    Object.entries(p)
      .flatMap(([group, values]) =>
        typeof values === 'object' && values !== null
          ? Object.keys(values as Record<string, unknown>).map((k) => `${group}.${k}`)
          : [group],
      )
      .sort();

  it('light and dark define exactly the same token names', () => {
    expect(shape(light)).toEqual(shape(dark));
  });

  it.each(palettes)('%s defines a value for every token, never undefined', (_name, p) => {
    const missing = Object.entries(p).flatMap(([group, values]) =>
      Object.entries(values as Record<string, unknown>)
        .filter(([, v]) => v === undefined || v === null || v === '')
        .map(([k]) => `${group}.${k}`),
    );
    expect(missing).toEqual([]);
  });
});

describe.each(palettes)('%s palette meets WCAG AA', (name, p) => {
  const backgrounds = [
    ['bg.base', p.bg.base],
    ['bg.raised', p.bg.raised],
    ['bg.sunken', p.bg.sunken],
  ] as const;

  const bodyText = [
    ['text.primary', p.text.primary],
    ['text.secondary', p.text.secondary],
    ['text.muted', p.text.muted],
  ] as const;

  it.each(backgrounds)(`body text is legible on %s`, (_bgName, bg) => {
    for (const [textName, fg] of bodyText) {
      const ratio = contrastRatio(fg, bg);
      // The name is in the message because a bare number tells you a pair failed
      // and not which one, and there are 18 of them.
      expect({ pair: `${name}: ${textName}`, ratio: Number(ratio.toFixed(2)) }).toEqual({
        pair: `${name}: ${textName}`,
        ratio: expect.any(Number),
      });
      expect(ratio).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('text on an intent colour is legible', () => {
    expect(contrastRatio(p.text.onAccent, p.intent.accent)).toBeGreaterThanOrEqual(AA_BODY);
    expect(contrastRatio(p.text.onDanger, p.intent.danger)).toBeGreaterThanOrEqual(AA_BODY);
  });

  /**
   * An intent colour used as TEXT (a danger message, a success note) against the
   * page, which is a different question from text placed ON it.
   */
  it('an intent colour used as text is legible on every surface', () => {
    for (const [, bg] of backgrounds) {
      expect(contrastRatio(p.intent.danger, bg)).toBeGreaterThanOrEqual(AA_LARGE);
      expect(contrastRatio(p.intent.accent, bg)).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it('a border is distinguishable from the surface it divides', () => {
    // A hairline is decoration and is deliberately NOT held to 3:1 - holding it
    // there would make every divider a hard rule. `line.strong` is the one used
    // where a boundary must be seen.
    expect(contrastRatio(p.line.strong, p.bg.base)).toBeGreaterThanOrEqual(1.5);
  });

  /**
   * THE ONE THAT MATTERS MOST: all 720 generated interest colours, not a sample.
   */
  it('every interest colour the generator can produce carries legible text', () => {
    const colours = everyInterestColour(p);
    expect(colours).toHaveLength(720);

    const failures = colours
      .map((c) => ({ colour: c, ratio: contrastRatio(p.text.onInterest, c) }))
      .filter((r) => r.ratio < AA_BODY);

    // Reported as the worst offenders rather than "one of 720 failed", so a
    // failure says which way to move the lightness.
    expect(failures.slice(0, 5)).toEqual([]);
  });
});
