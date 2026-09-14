/**
 * 011/T002. The password floor, in ONE editable place.
 *
 * TEN CHARACTERS, NO COMPOSITION RULES, and the reasoning is here rather than in
 * the spec alone because this is where somebody will come to change it.
 *
 * Length dominates character-class requirements for resistance to guessing, and
 * composition rules mostly produce predictable substitutions — the `P@ssw0rd1`
 * that satisfies every rule and is in every wordlist. A floor with the reasoning
 * attached can be raised by somebody who disagrees with the reasoning; a literal
 * inside a validator can only be raised by somebody who finds it.
 *
 * It is a guess, and `spec.md` records it as one under Assumptions.
 */
export const PASSWORD_MIN_LENGTH = 10;

/**
 * Said once, so the refusal and the hint before submission cannot drift apart.
 *
 * FR-005 requires the floor to be shown BEFORE submission rather than only in a
 * refusal, which means two surfaces state the same fact — and two statements of
 * one fact is the drift this project keeps recording (006's two palettes, 004's
 * two notification category lists, where "the duplicate is not a risk of drift,
 * it IS the drift").
 */
export const PASSWORD_FLOOR_MESSAGE = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
