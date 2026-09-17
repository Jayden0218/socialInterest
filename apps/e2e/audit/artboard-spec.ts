/**
 * AN ARTBOARD IS A SPEC, NOT A PICTURE — which is what makes this audit possible
 * without rendering anything.
 *
 * Each `design/007-ui/*.dc.html` is HTML with INLINE styles: every colour,
 * radius, gap, font size and weight the design asks for is a literal in the
 * file. So the approved design can be read as structured data and compared
 * against what the app actually renders, rather than against what the app's
 * SOURCE claims.
 *
 * That distinction is the whole point. Comparing source to source is exactly
 * what would have missed the typeface defect this repository has just fixed:
 * `tokens.ts` said `Plus Jakarta Sans` for nine features while every screen
 * rendered in Roboto, because the token was applied to nothing. A source diff
 * would have called that a match. Only measuring the rendered result can tell
 * the two apart, so the app's half of this comparison is `getComputedStyle`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export const ARTBOARD_DIR = join(__dirname, '..', '..', '..', 'design', '007-ui');

export interface ArtboardSpec {
  /** `Main.dc.html` */
  file: string;
  /** Lower-cased `#rrggbb`, every colour the artboard names. */
  colors: Set<string>;
  /** Every `font-size` in px. */
  fontSizes: Set<number>;
  /** Every `font-weight`. */
  fontWeights: Set<string>;
  /** Every `border-radius` in px; `50%` is recorded as the string. */
  radii: Set<string>;
  /** Every `gap` in px. */
  gaps: Set<number>;
}

/**
 * `#abc` and `#aabbcc` are the same colour, and an audit that reported them as a
 * difference would cry wolf on its first run. Expanded rather than compared as
 * written.
 */
function normaliseHex(raw: string): string {
  const h = raw.toLowerCase();
  if (h.length === 4) return `#${h[1]!}${h[1]!}${h[2]!}${h[2]!}${h[3]!}${h[3]!}`;
  return h;
}

export function parseArtboard(file: string): ArtboardSpec {
  const html = readFileSync(join(ARTBOARD_DIR, file), 'utf8');

  /**
   * THE `data-dc-script` BLOCK IS READ TOO, deliberately. Half of `Main.dc.html`'s
   * palette lives there — the card art gradients and each interest's hue are
   * returned from `renderVals()` rather than written in the markup. Parsing only
   * the markup would silently miss them, and a spec missing half its colours is
   * an audit that passes because it did not look.
   */
  const colors = new Set<string>();
  for (const m of html.matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b/g)) colors.add(normaliseHex(m[0]));

  const fontSizes = new Set<number>();
  for (const m of html.matchAll(/font-size:\s*([0-9.]+)px/g)) fontSizes.add(Number(m[1]));

  const fontWeights = new Set<string>();
  for (const m of html.matchAll(/font-weight:\s*([0-9]{3})/g)) fontWeights.add(m[1]!);

  const radii = new Set<string>();
  for (const m of html.matchAll(/border-radius:\s*([0-9.]+px|50%)/g)) radii.add(m[1]!);

  const gaps = new Set<number>();
  for (const m of html.matchAll(/(?:^|[;"\s])gap:\s*([0-9.]+)px/g)) gaps.add(Number(m[1]));

  return { file, colors, fontSizes, fontWeights, radii, gaps };
}

export function allArtboards(): ArtboardSpec[] {
  return readdirSync(ARTBOARD_DIR)
    .filter((f) => f.endsWith('.dc.html'))
    .sort()
    .map(parseArtboard);
}
