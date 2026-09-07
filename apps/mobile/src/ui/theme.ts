import { dark, light, elevation, radius, space, type, MIN_TOUCH_TARGET, type Palette } from './tokens';

export { dark, light, elevation, radius, space, type, MIN_TOUCH_TARGET };
export type { Palette };

/**
 * The active palette.
 *
 * DARK BY DEFAULT, because the brand is a dark green and the product should look
 * like itself the first time it opens rather than after a setting is found.
 */
export const activePalette: Palette = dark;

/**
 * The theme, in the shape every existing screen already imports.
 *
 * THIS IS AN ALIAS LAYER, ON PURPOSE. ~40 files import `theme.color.bg`,
 * `theme.space.md` and so on. Re-pointing those names at the new palette turns
 * the whole app dark green in one diff, with no risk of missing a screen and no
 * churn in files this change has no other reason to touch.
 *
 * New work should read `useTheme()` and the semantic tokens - `bg.raised`,
 * `text.secondary`, `intent.warning` - which the old shape has no names for. The
 * aliases stay until every call site has moved, and then they go.
 */
export const theme = {
  color: {
    bg: activePalette.bg.base,
    surface: activePalette.bg.raised,
    border: activePalette.line.hairline,
    text: activePalette.text.primary,
    muted: activePalette.text.muted,
    accent: activePalette.intent.accent,
    danger: activePalette.intent.danger,
    onAccent: activePalette.text.onAccent,
  },
  space,
  radius,
  font: {
    sm: type.caption.size,
    md: type.body.size,
    lg: type.title.size,
    xl: type.display.size,
  },
} as const;
