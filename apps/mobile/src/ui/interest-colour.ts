import { oklch, stableHash } from './color';
import { dark, light, type Palette } from './tokens';

/**
 * 006/R1, FR-011, FR-012. An interest's colour is DERIVED, never stored.
 *
 * Stored would mean a migration, an editing surface for a user-creatable thing,
 * and a moderation question. Derived means every client computes the same colour
 * with no round trip and no contract change - and a screenshot in a bug report
 * shows the same colour the reporter saw.
 *
 * LIGHTNESS AND CHROMA COME FROM THE PALETTE, NOT THE HASH. Only the hue varies.
 * That is what makes 006/SC-004 - every colour the generator can produce meets
 * contrast - a property held by construction: in OKLCH, fixed lightness means
 * every hue is about equally light, so if one hue passes at this lightness they
 * all do. A hash that also picked lightness would produce some chips that pass
 * and some that fail, decided by an interest's id.
 */
export interface InterestColourInput {
  interestId: string;
  /** Present on a sub-interest. FR-012: the family must be visible. */
  parentId?: string | null;
}

export function interestHue(interest: InterestColourInput): number {
  /**
   * A sub-interest takes its PARENT's hue.
   *
   * 001/FR-024 rolls a sub-interest's posts into its parent, so they are one
   * place as far as a feed is concerned. Giving them unrelated colours would
   * make the screen disagree with the product. They are told apart by lightness
   * instead - see `interestColour`.
   */
  const seed = interest.parentId ?? interest.interestId;
  return stableHash(seed) % 360;
}

/**
 * The chip colour for an interest in a given palette.
 *
 * A sub-interest sits one step lighter (dark palette) or darker (light palette)
 * than its parent, so a family reads as a family without a second hue.
 */
export function interestColour(interest: InterestColourInput, palette: Palette): string {
  const hue = interestHue(interest);
  const isChild = Boolean(interest.parentId);
  const shift = palette === dark ? 0.05 : -0.045;
  return oklch(palette.interest.l + (isChild ? shift : 0), palette.interest.c, hue);
}

/** Every colour the generator can produce, for the contrast test (006/R7). */
export function everyInterestColour(palette: Palette): string[] {
  const all: string[] = [];
  for (let hue = 0; hue < 360; hue++) {
    all.push(oklch(palette.interest.l, palette.interest.c, hue));
    const shift = palette === dark ? 0.05 : -0.045;
    all.push(oklch(palette.interest.l + shift, palette.interest.c, hue));
  }
  return all;
}

export { dark, light };
