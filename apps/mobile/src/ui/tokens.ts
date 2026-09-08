import { oklch } from './color';

/**
 * THE DESIGN SYSTEM — 007, rebuilt from `design/007-ui/_tokens.md`.
 *
 * One source for colour, type, spacing and radius. A screen that hard-codes a
 * value defined here is the thing that made the old UI "too general": forty
 * files each choosing their own grey.
 *
 * 007 INVERTED THE PALETTE. 006's signature was a dark forest green; the
 * approved 007 design is warm paper — page `#FBFAF8`, white cards, one accent
 * `#1F6B3F` — and its whole depth model is surface, gutter and radius, with no
 * shadow anywhere. That is not a preference: the owner rejected six passes for
 * being too fancy for something used forty times a day, and the answer was to
 * take things away rather than add them.
 *
 * THE SURFACE COLOURS ARE THE DESIGN'S OWN HEXES, not values derived from a
 * brand hue. The design is approved and settled (`design/007-ui/`), and a
 * derivation that lands two points away from the artboard is a slow drift away
 * from the thing that was signed off. Only the INTEREST colours are generated,
 * because they must exist for interests nobody has created yet.
 */

/**
 * The brand hue, kept because the interest generator needs a hue space and
 * because `#1F6B3F` is a point in it: a deep forest green.
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
 * THE DESIGN, as approved. Warm paper, white cards, one accent.
 *
 * `#8A948C` appears in the artboards for the faintest labels — tab captions and
 * like counts — and is NOT a token here. It fails WCAG AA as body text on white
 * (about 2.9:1), and `text.muted` carries those roles instead at `#606C66` —
 * the artboard's `#6B7770` was the first attempt and MEASURED at 4.14:1 against
 * the field surface, which is the reason this is a computed value and not an
 * eyeballed one.
 * which passes on every surface. That is a deliberate, stated deviation from the
 * artboard: the design is settled on FORM, and 006/FR-015's contrast floor is
 * not a matter of taste. Anything that genuinely needs to recede further is a
 * spacing or weight decision, not a paler grey.
 */
export const light: Palette = {
  bg: {
    /** The page. Warm, so a white card reads as raised without a shadow. */
    base: '#FBFAF8',
    /** The card, and the tab bar. */
    raised: '#FFFFFF',
    /** A field, and any inset well. */
    sunken: '#F3F1EC',
  },
  text: {
    primary: '#16211A',
    secondary: '#43514A',
    muted: '#606C66',
    onAccent: '#FFFFFF',
    onDanger: '#FFFFFF',
    onInterest: '#FFFFFF',
  },
  line: {
    hairline: '#ECEAE4',
    /** Where a boundary must actually be seen rather than merely implied. */
    strong: '#CFCABE',
  },
  intent: {
    accent: '#1F6B3F',
    danger: '#C0392B',
    warning: '#8A6116',
    success: '#1F6B3F',
  },
  /**
   * AN INTEREST IS A COLOURED WORD NOW (FR-024), not a chip with text on it —
   * so this lightness is chosen for a colour used AS TEXT on white, which is
   * the opposite end of the range from 006's tinted background.
   *
   * Every hue must clear AA at this lightness AGAINST BOTH the card and the
   * page, and `contrast.test.ts` enumerates all 720 rather than sampling.
   * Measured: the worst hue lands at 4.95:1 here, and at 4.19:1 two steps
   * lighter — which is what fixes this number rather than taste.
   */
  interest: { l: 0.52, c: 0.115 },
};

/**
 * DARK IS THE SAME PRODUCT AT NIGHT, and it is not the shipped default.
 *
 * Both palettes exist and both pass contrast (006/FR-017), and that is the
 * whole claim — see `useTheme`, which deliberately does not follow the platform
 * because screens read the palette at module scope and a style object built at
 * import time cannot call a hook. A WORKING light/dark switch needs every screen
 * to build its styles inside the component; that is a change of shape and is not
 * claimed here.
 */
export const dark: Palette = {
  bg: {
    base: '#121714',
    raised: '#1A211D',
    sunken: '#0D1210',
  },
  text: {
    primary: '#F2F4F2',
    secondary: '#C4CCC7',
    muted: '#9AA49E',
    onAccent: '#0D1210',
    onDanger: '#150807',
    onInterest: '#0D1210',
  },
  line: {
    hairline: '#2A322D',
    strong: '#56625A',
  },
  intent: {
    accent: '#5FC489',
    danger: '#F08A7C',
    warning: '#E0B44E',
    success: '#5FC489',
  },
  interest: { l: 0.82, c: 0.11 },
};

/**
 * TYPE: seven roles, never a number at a call site.
 *
 * Size, line height and weight travel together because they are one decision. A
 * caller that picks a size and leaves line height to the default is how a title
 * crowds the text under it on one screen and not another — 006 found the whole
 * app rendering at the platform default because the old shape carried a size
 * and nothing else.
 *
 * 006 had five roles; the approved 007 design uses seven, and the two new ones
 * are real distinctions rather than shades of the same: `small` is a like count
 * beside an avatar and `tab` is a tab-bar caption, and both sit below `caption`.
 * Values are the artboards' own (`_tokens.md`).
 *
 * Sizes are unitless points so platform font scaling still applies (FR-026).
 */
export const type = {
  /** The screen's own name, top left. */
  display: { size: 20, lineHeight: 26, weight: '700' as const },
  title: { size: 18, lineHeight: 24, weight: '700' as const },
  body: { size: 14, lineHeight: 21, weight: '400' as const },
  /** A card's title in the waterfall. */
  label: { size: 13.5, lineHeight: 18, weight: '600' as const },
  /** A byline, a timestamp, a secondary line. */
  caption: { size: 12.5, lineHeight: 17, weight: '500' as const },
  /** A count, a handle beside an avatar, the interest word. */
  small: { size: 11.5, lineHeight: 16, weight: '500' as const },
  tab: { size: 10.5, lineHeight: 14, weight: '600' as const },
} as const;

/**
 * The type roles as react-native STYLE objects, so a caller spreads one thing.
 *
 * Weight is deliberately NOT included. Several screens set a weight that is not
 * their role's, and folding it in would make whether the override wins depend on
 * the order properties happen to appear in — a silent, positional bug in place
 * of an explicit line.
 */
export const textStyle = {
  display: { fontSize: type.display.size, lineHeight: type.display.lineHeight },
  title: { fontSize: type.title.size, lineHeight: type.title.lineHeight },
  body: { fontSize: type.body.size, lineHeight: type.body.lineHeight },
  label: { fontSize: type.label.size, lineHeight: type.label.lineHeight },
  caption: { fontSize: type.caption.size, lineHeight: type.caption.lineHeight },
  small: { fontSize: type.small.size, lineHeight: type.small.lineHeight },
  tab: { fontSize: type.tab.size, lineHeight: type.tab.lineHeight },
} as const;

/**
 * THE ONE FAMILY (FR-022).
 *
 * A fallback stack, not a bare name: if the font fails to load the app must
 * still be legible in something with the same metrics, rather than falling back
 * to a serif and looking like a different product.
 */
export const FONT_FAMILY = 'Plus Jakarta Sans, system-ui, -apple-system, sans-serif';

/** A 4-point rhythm. Every gap and pad in the app is one of these. */
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/**
 * Radii from the artboards. `card`, `button`, `field` and `sheet` are the four
 * the design actually distinguishes; `sm`/`md`/`lg` remain as the general scale
 * so existing call sites keep meaning what they meant.
 */
export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  card: 14,
  button: 11,
  field: 21,
  sheet: 20,
  pill: 999,
} as const;

/**
 * THERE IS NO `elevation` EXPORT, AND ITS ABSENCE IS THE GUARD (FR-023).
 *
 * 006 shipped `elevation.raised` and `elevation.overlay`. The 007 design has no
 * shadows at all: depth is the white card on the warm page, the gutter between
 * cards, and the radius. Leaving a zeroed-out `elevation` object exported would
 * be an invitation; a name that does not exist is a TYPECHECK FAILURE the moment
 * somebody writes it again, which is stronger than a test and costs nothing.
 * `no-shadow.test.ts` covers the case of somebody writing the raw properties.
 */

/** 006/FR-020, carried forward. Below this, a control is not reliably tappable. */
export const MIN_TOUCH_TARGET = 44;

/**
 * The style every small control wears.
 *
 * A heart, a comment count, a coloured word — each is a few points of glyph, and
 * a `Pressable` with no style is exactly as big as its text. Padding does not
 * have to be visible for the target to be real, which is the point: the art
 * stays small and the target does not.
 */
export const touchTarget = {
  minHeight: MIN_TOUCH_TARGET,
  minWidth: MIN_TOUCH_TARGET,
  justifyContent: 'center',
  alignItems: 'center',
} as const;

/** Kept for the interest generator, which needs a hue space rather than hexes. */
export { oklch };
