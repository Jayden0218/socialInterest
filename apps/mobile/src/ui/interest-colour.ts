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
  // 013/T026a. A `parentId` used to live here so a child could borrow a
  // parent's hue. Interests are flat; the field and the comment describing it
  // both go, because a dangling doc comment for a deleted field is the copy
  // half of the same defect (013's quickstart §7: grep the COPY).
}

export function interestHue(interest: InterestColourInput): number {
  /**
   * ITS OWN ID, ALWAYS.
   *
   * A sub-interest used to take its PARENT's hue, because 001/FR-024 rolled its
   * posts into the parent and two unrelated colours for one place would have
   * made the screen disagree with the product. 013 withdrew the roll-up and the
   * hierarchy with it, so there is no parent to borrow from and no family to
   * signal.
   */
  const seed = interest.interestId;
  return stableHash(seed) % 360;
}

/**
 * The chip colour for an interest in a given palette.
 *
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
