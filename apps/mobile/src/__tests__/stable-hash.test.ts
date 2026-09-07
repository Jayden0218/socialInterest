import { stableHash } from '../ui/color';
import { interestHue, interestColour } from '../ui/interest-colour';
import { dark, light } from '../ui/tokens';

/**
 * 006/T012. `stableHash` IS PART OF THE PRODUCT'S APPEARANCE.
 *
 * Every interest's colour derives from it. Change the function and every
 * interest in every screenshot, every bug report and every person's memory
 * changes colour at once - silently, because nothing would fail.
 *
 * So the values are pinned as literals. If a change to `color.ts` makes this
 * fail, that is the guard working: the question to answer is not "what are the
 * new numbers" but "is recolouring the entire product intended".
 */
describe('stableHash is pinned, because it decides what the product looks like', () => {
  it('produces exactly these values', () => {
    expect(stableHash('')).toBe(0x811c9dc5);
    expect(stableHash('a')).toBe(0xe40c292c);
    expect(stableHash('interest')).toBe(stableHash('interest'));
    // Two ids that differ by one character must not collide.
    expect(stableHash('INT#001')).not.toBe(stableHash('INT#002'));
  });

  it('is unsigned and 32-bit for every input, including long ones', () => {
    for (const s of ['', 'a', 'INT#01JQ8Z', 'x'.repeat(500)]) {
      const h = stableHash(s);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('gives the same interest the same hue every time (FR-011)', () => {
    const a = interestHue({ interestId: 'INT#bouldering' });
    const b = interestHue({ interestId: 'INT#bouldering' });
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(360);
  });

  it('gives a sub-interest its PARENT hue, at a different lightness (FR-012)', () => {
    const parent = { interestId: 'INT#food' };
    const child = { interestId: 'INT#ramen', parentId: 'INT#food' };

    // Same hue - a family, because 001/FR-024 rolls the child's posts into the
    // parent and unrelated colours would make the screen disagree with that.
    expect(interestHue(child)).toBe(interestHue(parent));
    // Different colour, so they are still told apart.
    expect(interestColour(child, dark)).not.toBe(interestColour(parent, dark));
    expect(interestColour(child, light)).not.toBe(interestColour(parent, light));
  });

  it('gives the same interest a different colour in each palette', () => {
    const i = { interestId: 'INT#cycling' };
    expect(interestColour(i, dark)).not.toBe(interestColour(i, light));
  });
});
