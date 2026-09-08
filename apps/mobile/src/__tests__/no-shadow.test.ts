import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 007/FR-023 — NO SHADOWS, ANYWHERE.
 *
 * The approved design's whole depth model is three things: a white card on a
 * warm page, the gutter between cards, and a 14pt radius. There is no shadow on
 * any of the twenty artboards, and that is not an omission — it is the answer to
 * the six passes the owner rejected for being too fancy for something opened
 * forty times a day. A shadow is the single easiest way to make a flat design
 * look "finished", which is exactly why it needs a guard rather than a note.
 *
 * The token file's `elevation` export is DELETED rather than zeroed, so the
 * common route back is a typecheck failure. This covers the other route: a
 * screen writing the raw properties itself.
 */
const SRC = join(__dirname, '..');

/**
 * Comments stripped, for the reason this repository has now learned four times:
 * a guard that reads prose describes the intention, not the build. A comment
 * saying "no shadowColor anywhere" would fail this against correct code.
 */
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

/**
 * `textShadow*` is deliberately included. It is not a card shadow, but it is the
 * same instinct arriving by a different name, and nothing in the design uses it.
 */
const FORBIDDEN = /\b(shadowColor|shadowOpacity|shadowRadius|shadowOffset|textShadow\w*|elevation)\s*:/;

describe('007/FR-023 — the design has no shadows and neither does the code', () => {
  it('no file under src/ sets a shadow or elevation property', () => {
    const offenders = filesUnder(SRC)
      .filter((f) => FORBIDDEN.test(strip(readFileSync(f, 'utf8'))))
      .map((f) => f.replace(`${SRC}/`, ''));

    // Named, not counted: a failure should say which file to open.
    expect(offenders).toEqual([]);
  });

  it('the tokens module exports no elevation scale', () => {
    // The stronger half of the same guard. A name that does not exist is a
    // typecheck failure the moment somebody writes it, which no test can be —
    // so this reads the SOURCE rather than importing it, because importing it
    // could only ever confirm what typecheck has already settled.
    const tokens = strip(readFileSync(join(SRC, 'ui/tokens.ts'), 'utf8'));
    expect(tokens).not.toMatch(/export const elevation/);
  });
});
