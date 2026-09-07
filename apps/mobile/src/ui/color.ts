/**
 * Colour maths, in OKLCH, with no dependency.
 *
 * WHY OKLCH AND NOT HSL, because this is the decision the whole palette rests on.
 *
 * HSL's `L` is not lightness, it is a coordinate. At a fixed HSL lightness,
 * yellow is far brighter than blue - so a palette that generates a hue per
 * interest (006/FR-011) and fixes `L` would produce chips whose contrast varies
 * wildly with the hue the hash happened to pick. Some would fail WCAG and some
 * would not, and which ones depends on the interest's id.
 *
 * OKLab is perceptually uniform: at a fixed `L`, every hue is about equally
 * light. That is what makes 006/SC-004 - "every colour the generator can
 * produce meets contrast" - a property we can hold by construction rather than a
 * lottery we re-check per interest.
 *
 * Everything here is pure and deterministic. Two devices computing a colour for
 * the same interest MUST agree, so nothing may depend on the platform.
 */

export interface Oklch {
  /** Perceptual lightness, 0-1. */
  l: number;
  /** Chroma, 0 to ~0.37 in sRGB. */
  c: number;
  /** Hue in degrees, 0-360. */
  h: number;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/** Linear-light channel to sRGB's transfer function. */
const encodeGamma = (u: number): number =>
  u <= 0.0031308 ? 12.92 * u : 1.055 * Math.pow(u, 1 / 2.4) - 0.055;

/** sRGB's transfer function back to linear light. */
const decodeGamma = (u: number): number =>
  u <= 0.04045 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** OKLCH to linear-light sRGB. May fall outside 0-1 when out of gamut. */
function oklchToLinearRgb({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const bb = c * Math.sin(rad);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * bb;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * bb;
  const s_ = l - 0.0894841775 * a - 1.291485548 * bb;

  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;

  return {
    r: 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    g: -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    b: -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  };
}

const inGamut = ({ r, g, b }: Rgb): boolean =>
  r >= -0.0001 && r <= 1.0001 && g >= -0.0001 && g <= 1.0001 && b >= -0.0001 && b <= 1.0001;

/**
 * The colour, with chroma reduced until it fits in sRGB.
 *
 * Clamping the CHANNELS instead would shift the hue - a clipped red channel
 * turns a vivid green cyan-ward - so a palette built by clamping drifts in a way
 * nobody notices until two colours that should be a family are not. Reducing
 * chroma keeps hue and lightness exactly, which is what the palette depends on.
 */
function fitToGamut(colour: Oklch): Rgb {
  if (inGamut(oklchToLinearRgb(colour))) return oklchToLinearRgb(colour);

  let low = 0;
  let high = colour.c;
  // 20 halvings resolves chroma far finer than 8-bit output can show.
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    if (inGamut(oklchToLinearRgb({ ...colour, c: mid }))) low = mid;
    else high = mid;
  }
  return oklchToLinearRgb({ ...colour, c: low });
}

const toHexPair = (u: number): string =>
  Math.round(clamp01(u) * 255)
    .toString(16)
    .padStart(2, '0');

/** OKLCH to a `#rrggbb` string, gamut-fitted. */
export function oklch(l: number, c: number, h: number): string {
  const { r, g, b } = fitToGamut({ l, c, h });
  return `#${toHexPair(encodeGamma(clamp01(r)))}${toHexPair(encodeGamma(clamp01(g)))}${toHexPair(
    encodeGamma(clamp01(b)),
  )}`;
}

/** WCAG 2.1 relative luminance of a `#rrggbb` string. */
export function relativeLuminance(hex: string): number {
  const n = hex.replace('#', '');
  const r = decodeGamma(parseInt(n.slice(0, 2), 16) / 255);
  const g = decodeGamma(parseInt(n.slice(2, 4), 16) / 255);
  const b = decodeGamma(parseInt(n.slice(4, 6), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG 2.1 contrast ratio, 1 to 21.
 *
 * Computed from the HEX the app actually renders, not from the OKLCH we asked
 * for. Gamut fitting can move a colour, and a contrast figure taken before that
 * would describe a colour nobody sees.
 */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * FNV-1a, 32-bit. Spelled out rather than taken from anywhere.
 *
 * An interest's colour is derived from its id (006/R1), so this function is part
 * of the product's appearance: change it and every interest in every screenshot,
 * every bug report and every person's memory changes colour at once. It is
 * pinned by a test with literal expected values for that reason.
 */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // >>> 0 keeps it unsigned; Math.imul keeps the multiply 32-bit, which plain
    // `*` does not once the value exceeds 2^53.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
