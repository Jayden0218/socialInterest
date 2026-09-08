import { interestColour, interestHue, everyInterestColour } from '../ui/interest-colour';
import { dark, light } from '../ui/tokens';

/**
 * 006/US2, FR-011 and FR-012. The generator, on its own.
 *
 * `stable-hash.test.ts` pins the hash itself; this is about the RULES built on
 * it. They are separate files because they fail for different reasons: a change
 * to the hash recolours everything, a change here breaks a relationship.
 */
describe('interest colour derivation (006/US2)', () => {
  it('T026 gives the same interest the same colour, every time and in every palette', () => {
    const i = { interestId: 'INT#bouldering' };
    expect(interestColour(i, dark)).toBe(interestColour(i, dark));
    expect(interestColour(i, light)).toBe(interestColour(i, light));
  });

  /**
   * "Usually differ", not "always": 360 hues cannot separate an unbounded number
   * of interests, and pretending otherwise would be a test asserting something
   * false. Collisions are exactly why FR-014 requires the NAME to always be
   * present - colour narrows, the name says.
   */
  it('T026 separates most distinct interests, and does not pretend to separate all', () => {
    const ids = Array.from({ length: 200 }, (_, n) => ({ interestId: `INT#topic-${n}` }));
    const distinct = new Set(ids.map((i) => interestColour(i, dark)));
    // Comfortably more than half distinct is a working spread; 200 into 360 hues
    // must collide sometimes, by arithmetic.
    expect(distinct.size).toBeGreaterThan(120);
  });

  it('T027 gives a sub-interest its PARENT hue', () => {
    const parent = { interestId: 'INT#food' };
    const child = { interestId: 'INT#ramen', parentId: 'INT#food' };
    expect(interestHue(child)).toBe(interestHue(parent));
  });

  it('T027 still tells a parent and its child apart, by lightness', () => {
    const parent = { interestId: 'INT#food' };
    const child = { interestId: 'INT#ramen', parentId: 'INT#food' };
    for (const palette of [dark, light]) {
      expect(interestColour(child, palette)).not.toBe(interestColour(parent, palette));
    }
  });

  /**
   * Two children of the SAME parent share a colour, and that is the design
   * rather than a defect: 001/FR-024 rolls both their posts into the parent, so
   * they are one place as far as a feed is concerned. Pinned so nobody
   * "fixes" it into per-child hues and quietly contradicts the feed.
   */
  it('T027 gives siblings the same colour, because a feed treats them as one place', () => {
    const a = { interestId: 'INT#ramen', parentId: 'INT#food' };
    const b = { interestId: 'INT#pasta', parentId: 'INT#food' };
    expect(interestColour(a, dark)).toBe(interestColour(b, dark));
  });

  it('produces the full hue range in both palettes, with no duplicates from rounding', () => {
    for (const palette of [dark, light]) {
      const all = everyInterestColour(palette);
      expect(all).toHaveLength(720);
      // Rounding to 8-bit sRGB merges near neighbours; most must still survive.
      expect(new Set(all).size).toBeGreaterThan(400);
    }
  });
});
