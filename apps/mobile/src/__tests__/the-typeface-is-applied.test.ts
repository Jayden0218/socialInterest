/**
 * THE DESIGN HAD NEVER BEEN RENDERED IN ITS OWN TYPEFACE, ON ANY PLATFORM.
 *
 * `FONT_FAMILY` was `'Plus Jakarta Sans, system-ui, -apple-system, sans-serif'`
 * — a CSS stack, which React Native cannot parse; `fontFamily` takes ONE
 * registered name and a comma-separated list matches nothing, so Android fell
 * back to Roboto. No font file existed in the project, `expo-font` was not
 * installed, and the token was APPLIED TO NOTHING: its only two references were
 * its own definition and a re-export.
 *
 * Nine features went by. Every spacing, colour, radius and touch target matched
 * the artboards exactly, which is why nothing looked measurably wrong — and why
 * only a person looking at a phone ever noticed. This is the ninth instance of
 * the declared-half-with-no-other-half shape this repository keeps recording,
 * and the first one whose missing half was a file rather than a function.
 *
 * Three questions, each of which was answered the wrong way before this change.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { FONT, font, FONT_FAMILY } from '../ui/tokens';

const SRC = join(__dirname, '..');
const FONT_DIR = join(__dirname, '..', '..', 'assets', 'fonts');

/** Every `.ts`/`.tsx` under src, tests excluded. Walks the DIRECTORY rather than
 *  naming files: a guard that reads a path by name loses its subject the moment
 *  somebody moves it, and passes — which cost this project a whole feature once
 *  (`hooks-before-return.test.ts` over a barrel of re-exports). */
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' ? [] : sources(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe('the typeface is real, named correctly, and actually applied', () => {
  it('names ONE family per weight, never a CSS stack React Native cannot parse', () => {
    for (const [weight, family] of Object.entries(FONT)) {
      expect(family).not.toContain(',');
      expect(family).not.toMatch(/system-ui|sans-serif|-apple-system/);
      expect(font(weight as keyof typeof FONT).fontFamily).toBe(family);
    }
    expect(FONT_FAMILY).not.toContain(',');
  });

  it('ships a file for every weight, under the exact name the family resolves to', () => {
    // The Android family name IS the file's basename. A rename here is a silent
    // fallback to Roboto, so the file must exist at precisely this name.
    for (const family of Object.values(FONT)) {
      expect(existsSync(join(FONT_DIR, `${family}.ttf`))).toBe(true);
    }
  });

  it('leaves no bare fontWeight anywhere: a weight cannot be set without a family', () => {
    /**
     * The whole defect in one line. A `fontWeight` on its own is a weight with
     * no typeface behind it, which is what all 44 call sites were. `font(w)`
     * returns both together so they cannot disagree and neither can be
     * forgotten — and this assertion is what keeps it that way.
     */
    const offenders = sources(SRC)
      .filter((f) => !f.endsWith(join('ui', 'tokens.ts')))
      .flatMap((f) =>
        readFileSync(f, 'utf8')
          .split('\n')
          .map((line, i) => ({ f, i: i + 1, line }))
          .filter(({ line }) => /(^|[^.\w])fontWeight\s*:/.test(line) && !line.trim().startsWith('*')),
      )
      .map(({ f, i, line }) => `${f.slice(SRC.length + 1)}:${i}  ${line.trim()}`);

    expect(offenders).toEqual([]);
  });

  it('found enough files to be looking at the real app', () => {
    // `expect(offenders).toEqual([])` is vacuously true over an empty list, so
    // the guard above proves nothing unless it read something. Same reason
    // `hooks-before-return.test.ts` now counts its own subjects.
    expect(sources(SRC).length).toBeGreaterThan(50);
  });
});
