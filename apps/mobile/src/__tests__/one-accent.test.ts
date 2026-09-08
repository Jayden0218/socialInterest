import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { light, dark } from '../ui/tokens';

/**
 * 007/FR-022 — ONE ACCENT, ENFORCED MECHANICALLY RATHER THAN BY EYE.
 *
 * The design has exactly one accent, `#1F6B3F`, and it earns its weight by
 * being the only saturated colour in the chrome. A second one — a blue link, a
 * red badge, an orange "new" dot — does not look wrong on the screen it is added
 * to. It looks wrong three screens later, by which point there are four of them
 * and no single change to revert.
 *
 * So this counts. Any hex outside the token file that is SATURATED enough to
 * read as an accent is a failure; greys, near-blacks and near-whites are not
 * accents and are caught by `no-hardcoded-style.test.ts` instead, which is a
 * different rule about a different mistake.
 *
 * The interest colours are exempt BY CONSTRUCTION rather than by exception:
 * they are generated in OKLCH from a hash and never written as a hex anywhere.
 */
const SRC = join(__dirname, '..');
const DEFINES_COLOUR = new Set(['tokens.ts', 'color.ts', 'interest-colour.ts']);

const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** Expand `#abc` so both forms are measured the same way. */
function toRgb(hex: string): [number, number, number] {
  const h = hex.length === 4 ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}` : hex;
  return [
    parseInt(h.slice(1, 3), 16),
    parseInt(h.slice(3, 5), 16),
    parseInt(h.slice(5, 7), 16),
  ];
}

/**
 * How far from grey a colour is, 0..1. A grey has max === min.
 *
 * 0.15 is the threshold, and it is deliberately generous: the palette's own
 * warm greys reach about 0.04, so nothing legitimate is near it, and anything a
 * person would call "a colour" is far above it.
 */
function saturation(hex: string): number {
  const [r, g, b] = toRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

const ACCENT_THRESHOLD = 0.15;

describe('007/FR-022 — one accent', () => {
  it('the token file itself declares exactly one accent, shared by intent.success', () => {
    // Stated here so the number below has something to be one OF. `success` is
    // the same green on purpose: two greens that nearly match is the failure
    // this whole rule exists to prevent.
    expect(light.intent.accent).toBe('#1F6B3F');
    expect(light.intent.success).toBe(light.intent.accent);
    expect(dark.intent.success).toBe(dark.intent.accent);
  });

  it('no file outside the colour-defining modules writes a saturated hex', () => {
    const offenders: { file: string; colours: string[] }[] = [];

    for (const file of filesUnder(SRC)) {
      const name = file.split('/').pop()!;
      if (DEFINES_COLOUR.has(name)) continue;
      const src = strip(readFileSync(file, 'utf8'));
      const colours = [...src.matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g)]
        .map((m) => m[0])
        .filter((hex) => saturation(hex) >= ACCENT_THRESHOLD);
      if (colours.length > 0) offenders.push({ file: file.replace(`${SRC}/`, ''), colours });
    }

    // Named with their colours, so a failure says what was added and where —
    // 006 found `#d97706` sitting in `primitives.tsx`, the one file whose job is
    // to stop exactly that, and a bare count would not have said so.
    expect(offenders).toEqual([]);
  });
});
