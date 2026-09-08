import { dark, light, radius, space, type, textStyle, touchTarget, FONT_FAMILY, MIN_TOUCH_TARGET, type Palette } from './tokens';

export { dark, light, radius, space, type, textStyle, touchTarget, FONT_FAMILY, MIN_TOUCH_TARGET };
export type { Palette };

/**
 * The active palette.
 *
 * LIGHT, because the approved 007 design is warm paper. 006's default was dark
 * green and that was the right default for THAT design; this is not a setting
 * being flipped, it is a different product surface — see `tokens.ts`.
 */
export const activePalette: Palette = light;

/**
 * THE ALIAS LAYER IS GONE, and its absence is the guard.
 *
 * `theme.color.bg`, `theme.font.md` and friends existed so 006 could re-point
 * ~40 screens at the new palette in one diff without touching them. Every call
 * site has now moved to the semantic names, so the shim is deleted rather than
 * left available: an export nobody imports is an invitation, while a name that
 * does not exist is a TYPECHECK FAILURE the moment somebody writes it again.
 * That is a stronger guard than a test, and it costs nothing to keep.
 *
 * 007 REMOVED `elevation` FOR THE SAME REASON. The design has no shadows at
 * all, so a zeroed-out object left exported would be an invitation; the name
 * simply not existing is a typecheck failure the moment somebody writes it.
 *
 * The migration was not only renaming. `theme.font.X` carried a SIZE and
 * nothing else, so every screen outside this directory rendered with the
 * platform's default line height and the scale's `lineHeight` was dead data
 * (006/FR-018). Reading the role gives size and line height together.
 */
