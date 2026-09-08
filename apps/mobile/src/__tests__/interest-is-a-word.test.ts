import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 007/FR-024 — THE INTEREST IS A COLOURED WORD, AND STAYS ONE.
 *
 * The design has exactly one quiet signature and this is it: the interest's
 * name in its own colour, with no container. A chip, a badge, a pill or a stamp
 * is the same information wearing furniture, and it is what every earlier pass
 * did — the owner rejected six of them, twice for being too busy.
 *
 * This is worth a guard rather than a note because the change back is ONE LINE
 * and looks like an improvement while you are making it: a background to "make
 * it stand out", a border to "define it", a radius because it now needs one.
 * Each is defensible alone; together they are the rejected design.
 *
 * Asserted against the RENDERING, not against the word "chip". The testID is
 * still `interest-chip-<slug>` on purpose — `contracts/testid-preservation.md`
 * is about the id and what it marks, and what it marks has not changed — so a
 * guard that scanned for the string would fail on correct code and teach
 * somebody to rename the id, which is the one thing that must not happen.
 */
const WORD = join(__dirname, '../components/InterestWord.tsx');

const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('an interest renders as a word, never as a chip', () => {
  const src = strip(readFileSync(WORD, 'utf8'));

  it('has no background of its own', () => {
    expect(src).not.toMatch(/backgroundColor/);
  });

  it('has no border of its own', () => {
    expect(src).not.toMatch(/borderWidth|borderColor/);
  });

  it('has no radius of its own', () => {
    // The three together are a chip. Any one of them is the first of the three.
    expect(src).not.toMatch(/borderRadius/);
  });

  it('has no padding of its own', () => {
    // Padding without a background is invisible, which is precisely why it
    // arrives first and why the background that makes it visible arrives later.
    expect(src).not.toMatch(/padding\w*\s*:/);
  });

  it('still carries the interest COLOUR and the interest NAME', () => {
    // The inverse, so this file cannot pass by rendering nothing at all — which
    // is the failure mode of every guard written only as a list of absences.
    expect(src).toMatch(/interestColour/);
    expect(src).toMatch(/\{interest\.name\}/);
  });
});
