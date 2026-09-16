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
  // 013/T026a. Its own id, always. A child no longer borrows a parent's hue.
  const seed = interest.interestId;
  return stableHash(seed) % 360;
}

/**
 * The chip colour for an interest in a given palette.
 *
 * A sub-interest sits one step lighter (dark palette) or darker (light palette)
 * than its parent, so a family reads as a family without a second hue.
 */
/**
 * 013/T026a. THE CHILD BRANCH IS GONE, AND SO IS THE HUE IT BORROWED.
 *
 * A sub-interest used to take its PARENT's hue — `parentId ?? interestId` — and
 * sit one step lighter or darker, so a family read as a family. Interests are
 * flat now, so there is no family: every interest takes its own hue at the base
 * lightness.
 *
 * **Every interest that used to be a sub-interest visibly changes colour.** That
 * is accepted rather than overlooked: preserving the old hues would mean keeping
 * `parentId` for ever, which 013/T010 deletes precisely to stop the hierarchy
 * re-growing.
 *
 * `everyInterestColour` below loses the same branch, in the same commit. Left
 * alone it would keep enumerating a second lightness that can no longer occur,
 * and the contrast guard would go on passing over half a space the product
 * cannot reach — a guard covering something that is not there.
 */
export function interestColour(interest: InterestColourInput, palette: Palette): string {
  return oklch(palette.interest.l, palette.interest.c, interestHue(interest));
}

/** Every colour the generator can produce, for the contrast test (006/R7). */
export function everyInterestColour(palette: Palette): string[] {
  const all: string[] = [];
  for (let hue = 0; hue < 360; hue++) {
    all.push(oklch(palette.interest.l, palette.interest.c, hue));
  }
  return all;
}

export { dark, light };
