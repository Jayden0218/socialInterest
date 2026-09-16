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

  /**
   * ────────────────────────────────────────────────────────────────────────
   * 013/T026a. THREE ASSERTIONS INVERTED, NOT DELETED.
   * ────────────────────────────────────────────────────────────────────────
   *
   * 006/T027 pinned three facts: a sub-interest took its PARENT's hue, a child
   * was told apart from its parent by lightness, and two children of one parent
   * shared a colour — "they are one place as far as a feed is concerned",
   * because 001/FR-024 rolled both their posts into the parent.
   *
   * 013 makes interests flat. The roll-up is withdrawn, so siblings are not one
   * place, and there is no parent to borrow from. Every interest takes its own
   * hue at the base lightness.
   *
   * These are INVERTED rather than removed, for the reason the PostCard byline
   * was: a test that simply stops mentioning a behaviour cannot distinguish
   * "we meant to remove this" from "it fell off".
   */
  it('013: an interest takes its OWN hue — a parent id no longer changes it', () => {
    const child = { interestId: 'INT#ramen' };
    const parent = { interestId: 'INT#food' };
    expect(interestHue(child)).not.toBe(interestHue(parent));
  });

  it('013: two interests that were siblings no longer share a colour', () => {
    const a = { interestId: 'INT#ramen' };
    const b = { interestId: 'INT#pasta' };
    expect(interestColour(a, dark)).not.toBe(interestColour(b, dark));
  });

  it('produces the full hue range in both palettes, with no duplicates from rounding', () => {
    for (const palette of [dark, light]) {
      const all = everyInterestColour(palette);
      // 013/T026a. 360, not 720. The generator enumerated each hue at two
      // lightnesses because a child sat one step from its parent; with no
      // children the second is unreachable, and an enumeration covering colours
      // the product cannot produce is a guard covering something that is not
      // there.
      expect(all).toHaveLength(360);
      // Rounding to 8-bit sRGB merges near neighbours; most must still survive.
      // 013/T026a: the floor was 400 against 720 inputs. With 360 inputs the
      // ceiling IS 360, so the floor moves with it — a bound that can never be
      // met is not a bound, and leaving it would have read as a real regression.
      expect(new Set(all).size).toBeGreaterThan(300);
    }
  });
});
