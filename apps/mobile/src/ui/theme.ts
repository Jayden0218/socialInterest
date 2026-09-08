import { dark, light, elevation, radius, space, type, textStyle, touchTarget, MIN_TOUCH_TARGET, type Palette } from './tokens';

export { dark, light, elevation, radius, space, type, textStyle, touchTarget, MIN_TOUCH_TARGET };
export type { Palette };

/**
 * The active palette.
 *
 * DARK BY DEFAULT, because the brand is a dark green and the product should look
 * like itself the first time it opens rather than after a setting is found.
 */
export const activePalette: Palette = dark;

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
 * The migration was not only renaming. `theme.font.X` carried a SIZE and
 * nothing else, so every screen outside this directory rendered with the
 * platform's default line height and the scale's `lineHeight` was dead data
 * (006/FR-018). Reading the role gives size and line height together.
 */
