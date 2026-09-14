/**
 * 011/T002. The password floor — RE-EXPORTED, not restated.
 *
 * The value lives in `@sih/shared` because the APP has to state the same fact:
 * FR-005 requires the floor to be shown before submission, not only in a
 * refusal. Two statements of one number is the drift this project keeps
 * recording — 004's two notification category lists, where "the duplicate is
 * not a risk of drift, it IS the drift".
 *
 * This file stays so that `modules/auth` has one obvious place to look, and so
 * that anything else the module needs to pin has somewhere to go.
 */
export { PASSWORD_MIN_LENGTH, PASSWORD_FLOOR_MESSAGE } from '@sih/shared';
