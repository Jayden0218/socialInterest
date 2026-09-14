/**
 * 011. THE PASSWORD FLOOR, IN ONE PLACE THAT BOTH SIDES READ.
 *
 * FR-005 requires the floor to be shown BEFORE submission as well as enforced
 * on refusal, which means the screen and the server state the same fact. Two
 * statements of one fact is the drift this project keeps recording — 006's
 * "white cards inside dark green chrome" was two palettes, 004's notification
 * categories were two lists, and the note there is worth repeating: *the
 * duplicate is not a risk of drift, it IS the drift.*
 *
 * So it lives in `@sih/shared`, which the API and the app both already depend
 * on, and neither of them may type the number.
 *
 * TEN CHARACTERS, NO COMPOSITION RULES. Length dominates character-class
 * requirements for resistance to guessing, and composition rules mostly produce
 * predictable substitutions — the `P@ssw0rd1` that satisfies every rule and sits
 * in every wordlist. It is a guess, and 011's Assumptions records it as one.
 */
export const PASSWORD_MIN_LENGTH = 10;

/** Said once, so the hint and the refusal cannot disagree. */
export const PASSWORD_FLOOR_MESSAGE = `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
