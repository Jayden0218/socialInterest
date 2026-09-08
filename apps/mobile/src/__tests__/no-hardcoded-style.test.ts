import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 006/FR-016. A SCREEN MAY NOT HARD-CODE A VALUE THE THEME DEFINES.
 *
 * This is the rule that makes tokens worth having, and its absence is what "too
 * general" looked like from the inside: forty files each choosing their own grey
 * and their own 14px, none of them wrong on their own, none of them agreeing.
 *
 * The exception is stated in contracts/design-tokens.md rather than argued case
 * by case: a value that is genuinely one-off AND structural - `flex: 1`, a
 * hairline `borderWidth: 1` - is not a token. A COLOUR, a FONT SIZE, a RADIUS or
 * a SPACING step always is.
 *
 * Scoped to `features/` deliberately. `ui/` is where the values live and
 * `components/` composes them; a literal there is the definition, not a drift.
 */
const FEATURES = join(__dirname, '../features');

/**
 * `ui/` is scanned too, minus the two files where colour is DEFINED.
 *
 * A raw amber hex sat in `primitives.tsx` - the file whose whole job is to stop
 * that - and this guard could not see it, because it only looked at `features/`.
 * The definition layer is exactly where a literal is invisible and most costly:
 * every screen inherits it.
 */
const UI = join(__dirname, '../ui');
const DEFINES_VALUES = new Set(['tokens.ts', 'color.ts']);

const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('feature screens read the theme (006/FR-016)', () => {
  it('no literal colour appears in a feature screen', () => {
    const offenders: string[] = [];
    for (const file of [...filesUnder(FEATURES), ...filesUnder(UI)]) {
      if (DEFINES_VALUES.has(file.split('/').pop() ?? '')) continue;
      const src = strip(readFileSync(file, 'utf8'));
      for (const m of src.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/g)) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${file.slice(file.indexOf('src/'))}:${line} → ${m[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * A raw `fontSize: 15` is the same drift as a raw colour, and harder to spot
   * because a number looks innocent. Sizes must come from `theme.font` or the
   * type roles.
   */
  it('no raw font size appears in a feature screen', () => {
    const offenders: string[] = [];
    for (const file of [...filesUnder(FEATURES), ...filesUnder(UI)]) {
      if (DEFINES_VALUES.has(file.split('/').pop() ?? '')) continue;
      const src = strip(readFileSync(file, 'utf8'));
      for (const m of src.matchAll(/fontSize:\s*(\d+)/g)) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${file.slice(file.indexOf('src/'))}:${line} → fontSize: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
