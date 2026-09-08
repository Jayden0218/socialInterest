import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 006 GATE G1. THE INTEREST TREATMENT BELONGS TO INTERESTS.
 *
 * Constitution Principle I, which is NON-NEGOTIABLE: interest is the organising
 * principle, and a person-follow must never widen a feed. 004/FR-019 extends the
 * same rule to places - following a place saves it for you and deliberately does
 * NOT put its posts in your feed, which `place-follow-hint` says in words on the
 * place screen today.
 *
 * A visual system can contradict that without a line of logic changing. If a
 * place page wore the interest colour, or a profile carried an interest chip,
 * the screen would be telling a person these things behave alike when the whole
 * design says they do not. Nobody would file that as a bug; they would simply
 * expect their feed to fill up and be wrong about their own product.
 *
 * So this fails on the DEPENDENCY appearing - the same shape as
 * `feed-does-not-read-place-follows.spec.ts` - rather than waiting for a screen
 * that demonstrates it.
 *
 * `Avatar` is deliberately exempt and is the one legitimate exception: it uses
 * the same GENERATOR seeded by a userId, which is a shared hash function, not a
 * shared meaning. A round monogram is not an interest chip.
 */
const SRC = join(__dirname, '..');

const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Feature directories that are about places or people, never about interests. */
const NOT_INTERESTS = ['features/places', 'features/profile'];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full));
    else if (entry.endsWith('.tsx') || entry.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('places and people do not wear the interest treatment (G1)', () => {
  it.each(NOT_INTERESTS)('%s imports no interest colour and renders no interest chip', (rel) => {
    const offenders: string[] = [];
    for (const file of filesUnder(join(SRC, rel))) {
      const src = strip(readFileSync(file, 'utf8'));
      if (/interest-colour|interestColour|InterestChip/.test(src)) {
        offenders.push(file.slice(file.indexOf('src/')));
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * And the words stay. 004/FR-019 is explained to the person on the place
   * screen; a redesign that demoted that sentence to an icon, or removed it as
   * clutter, would leave the surprise with nothing to explain it.
   */
  it('the place screen still explains that following a place does not fill a feed', () => {
    const src = readFileSync(join(SRC, 'features/places/PlaceScreen.tsx'), 'utf8');
    expect(src).toContain('place-follow-hint');
    expect(src).toMatch(/feed/i);
  });
});
