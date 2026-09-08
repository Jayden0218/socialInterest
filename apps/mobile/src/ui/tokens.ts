import { oklch } from './color';

/**
 * THE DESIGN SYSTEM.
 *
 * One source for colour, type, spacing, radius and elevation. A screen that
 * hard-codes a value defined here is the thing that made the old UI "too
 * general": forty files each choosing their own grey.
 *
 * Everything is expressed in OKLCH and converted once, at module load. See
 * `color.ts` for why not HSL - in short, a hue-per-interest palette only holds
 * its contrast guarantees if lightness is perceptual.
 */

/**
 * The brand hue: a deep forest green.
 *
 * Chosen as a hue rather than a hex so every green in the product - surfaces,
 * accent, success, the tint under an interest chip - is the SAME green at
 * different lightness and chroma, instead of six greens that nearly match.
 */
export const BRAND_HUE = 152;

export interface Palette {
  bg: { base: string; raised: string; sunken: string };
  text: {
    primary: string;
    secondary: string;
    muted: string;
    onAccent: string;
    onDanger: string;
    onInterest: string;
  };
  line: { hairline: string; strong: string };
  intent: { accent: string; danger: string; warning: string; success: string };
  /** Lightness and chroma for a generated interest colour in this palette. */
  interest: { l: number; c: number };
}

/**
 * DARK IS THE SIGNATURE, not an afterthought.
 *
 * The surfaces are green rather than neutral - `bg.base` is a deep forest, not
 * near-black with a green accent dropped on top. That is the difference between
 * an app that has a colour and an app that is one, and it is the whole reason
 * the brand is expressed as a hue that every surface shares.
 */
export const dark: Palette = {
  bg: {
    base: oklch(0.19, 0.028, BRAND_HUE),
    raised: oklch(0.245, 0.032, BRAND_HUE),
    sunken: oklch(0.15, 0.024, BRAND_HUE),
  },
  text: {
    primary: oklch(0.97, 0.01, BRAND_HUE),
    secondary: oklch(0.85, 0.016, BRAND_HUE),
    muted: oklch(0.72, 0.02, BRAND_HUE),
    onAccent: oklch(0.18, 0.03, BRAND_HUE),
    onDanger: oklch(0.16, 0.03, 25),
    onInterest: oklch(0.97, 0.01, BRAND_HUE),
  },
  line: {
    hairline: oklch(0.33, 0.026, BRAND_HUE),
    strong: oklch(0.46, 0.036, BRAND_HUE),
  },
  intent: {
    accent: oklch(0.8, 0.155, 150),
    danger: oklch(0.72, 0.16, 25),
    warning: oklch(0.82, 0.14, 80),
    success: oklch(0.82, 0.15, 145),
  },
  interest: { l: 0.34, c: 0.08 },
};

/**
 * Light is the same product in daylight: paper with a green cast, never a
 * different design. `bg.base` carries a trace of the brand hue so a white card
 * on it reads as raised rather than as the page.
 */
export const light: Palette = {
  bg: {
    base: oklch(0.975, 0.008, BRAND_HUE),
    raised: oklch(1.0, 0.0, BRAND_HUE),
    sunken: oklch(0.94, 0.012, BRAND_HUE),
  },
  text: {
    primary: oklch(0.26, 0.036, BRAND_HUE),
    secondary: oklch(0.44, 0.03, BRAND_HUE),
    muted: oklch(0.5, 0.028, BRAND_HUE),
    onAccent: oklch(0.99, 0.004, BRAND_HUE),
    onDanger: oklch(0.99, 0.004, 25),
    onInterest: oklch(0.26, 0.036, BRAND_HUE),
  },
  line: {
    hairline: oklch(0.9, 0.014, BRAND_HUE),
    strong: oklch(0.79, 0.022, BRAND_HUE),
  },
  intent: {
    accent: oklch(0.46, 0.13, 150),
    danger: oklch(0.5, 0.19, 25),
    warning: oklch(0.58, 0.15, 75),
    success: oklch(0.47, 0.13, 150),
  },
  interest: { l: 0.9, c: 0.055 },
};

/**
 * TYPE: five roles, never a number at a call site (006/FR-018).
 *
 * Size, line height and weight travel together because they are one decision.
 * A caller that picks a size and leaves line height to the default is how a
 * title ends up crowding the text under it on one screen and not another.
 *
 * Sizes are unitless points so platform font scaling still applies (FR-021).
 */
export const type = {
  display: { size: 30, lineHeight: 36, weight: '700' as const },
  // '600', not '650': react-native accepts weights in hundreds only.
  title: { size: 20, lineHeight: 26, weight: '600' as const },
  body: { size: 15, lineHeight: 22, weight: '400' as const },
  label: { size: 13, lineHeight: 18, weight: '600' as const },
  caption: { size: 12, lineHeight: 16, weight: '400' as const },
} as const;

/**
 * The type roles as react-native STYLE objects, so a caller spreads one thing.
 *
 * `type.body` names the role; `textStyle.body` is the role expressed in the
 * property names a `<Text>` actually takes. Without it every call site writes
 * `fontSize: type.body.size, lineHeight: type.body.lineHeight` - two properties
 * that must move together and, being separate, do not have to. 006's migration
 * off the old alias layer found the failure mode: the previous shape carried a
 * SIZE ONLY, so the whole app rendered at the platform's default line height
 * and the scale's `lineHeight` was dead data (FR-018).
 *
 * Weight is deliberately NOT included. Several screens set a weight that is not
 * their role's, and folding it in would make whether the override wins depend
 * on the order properties happen to appear in - a silent, positional bug in
 * place of an explicit line.
 */
export const textStyle = {
  display: { fontSize: type.display.size, lineHeight: type.display.lineHeight },
  title: { fontSize: type.title.size, lineHeight: type.title.lineHeight },
  body: { fontSize: type.body.size, lineHeight: type.body.lineHeight },
  label: { fontSize: type.label.size, lineHeight: type.label.lineHeight },
  caption: { fontSize: type.caption.size, lineHeight: type.caption.lineHeight },
} as const;

/** A 4-point rhythm. Every gap and pad in the app is one of these. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 6, md: 12, lg: 18, pill: 999 } as const;

/**
 * Elevation, expressed so it degrades sanely under react-native-web (FR-029).
 *
 * `shadowColor` etc. are honoured on iOS and by react-native-web; `elevation` is
 * Android's. Both are given, so a card is raised on every target rather than
 * flat on one of them.
 */
export const elevation = {
  flat: { shadowOpacity: 0, elevation: 0 },
  raised: {
    shadowColor: '#000000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  overlay: {
    shadowColor: '#000000',
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
} as const;

/** 006/FR-020. Below this, a control is not reliably tappable. */
export const MIN_TOUCH_TARGET = 44;

/**
 * The style every small control wears.
 *
 * A heart, a comment count, a chip - each is a few points of glyph, and a
 * `Pressable` with no style is exactly as big as its text. The reaction, comment
 * and share buttons under every post were about 20 points until this existed,
 * which is a shipped accessibility defect rather than a rough edge: it was not
 * visible in any screenshot and no test asked.
 *
 * Padding does not have to be visible for the target to be real, which is the
 * point - the art stays small and the target does not.
 */
export const touchTarget = {
  minHeight: MIN_TOUCH_TARGET,
  minWidth: MIN_TOUCH_TARGET,
  justifyContent: 'center',
  alignItems: 'center',
} as const;
