# Contract: the design tokens

**Status**: binding. Enforced by `apps/mobile/src/__tests__/contrast.test.ts`
(R7) and `touch-target.test.ts`.

## The brand

`BRAND_HUE = 152` — a deep forest green. Every green in the product derives from
it: `bg.base`, `bg.raised`, `bg.sunken`, `intent.accent`, `intent.success`, and
the tint under an interest chip. A hex per green gives six greens that nearly
match; one hue at different lightness and chroma is a family by construction.

**Dark is the default palette.** A brand that appears only after a setting is
found is not one.

## Colours are declared in OKLCH

Every token is written as `oklch(l, c, h)` and converted to sRGB once, at module
load (`ui/color.ts`). This is load-bearing rather than stylistic:

- An interest's colour is generated from a hash of its id (R1). HSL's `L` is a
  coordinate, not lightness — at a fixed HSL `L`, yellow is far brighter than
  blue — so a fixed-`L` HSL palette would give some interests legible chips and
  others not, **decided by the id**. OKLab is perceptually uniform, so fixing
  lightness makes SC-004 hold by construction.
- Gamut fitting reduces **chroma**, never clamps channels. Clamping a channel
  shifts the hue — a clipped red turns a vivid green cyan-ward — which would
  silently break the sub-interest families FR-012 depends on.
- Contrast is computed from the **hex the app renders**, after gamut fitting, not
  from the OKLCH that was asked for. A ratio taken before fitting describes a
  colour nobody sees.

### The palettes

Values are `oklch(lightness, chroma, hue)`; `H` is `BRAND_HUE` unless stated.

| Token | Dark | Light |
|---|---|---|
| `bg.base` | `0.19, 0.028, H` | `0.975, 0.008, H` |
| `bg.raised` | `0.245, 0.032, H` | `1.0, 0, H` |
| `bg.sunken` | `0.15, 0.024, H` | `0.94, 0.012, H` |
| `text.primary` | `0.97, 0.010, H` | `0.26, 0.036, H` |
| `text.secondary` | `0.85, 0.016, H` | `0.44, 0.030, H` |
| `text.muted` | `0.72, 0.020, H` | `0.50, 0.028, H` |
| `text.onAccent` | `0.18, 0.03, H` | `0.99, 0.004, H` |
| `text.onDanger` | `0.16, 0.03, 25` | `0.99, 0.004, 25` |
| `text.onInterest` | same as `text.primary` | same as `text.primary` |
| `line.hairline` | `0.33, 0.026, H` | `0.90, 0.014, H` |
| `line.strong` | `0.46, 0.036, H` | `0.79, 0.022, H` |
| `intent.accent` | `0.80, 0.155, 150` | `0.46, 0.130, 150` |
| `intent.danger` | `0.72, 0.160, 25` | `0.50, 0.190, 25` |
| `intent.warning` | `0.82, 0.140, 80` | `0.58, 0.150, 75` |
| `intent.success` | `0.82, 0.150, 145` | `0.47, 0.130, 150` |
| `interest` (chip) | `l 0.34, c 0.08` | `l 0.90, c 0.055` |

`text.muted` in the light palette is `0.50` and not `0.54` because **the contrast
test failed at `0.54`**: 4.24 against `bg.sunken`, below the 4.5 requirement. The
number is a measured result, not a preference.

An interest chip varies only its **hue**; lightness and chroma come from the row
above. A sub-interest shifts lightness by `+0.05` (dark) or `-0.045` (light) and
keeps its parent's hue (FR-012).

## The rule that makes tokens worth having

A screen MUST NOT hard-code a value the theme defines (FR-016). A literal colour,
font size or spacing in a feature file is a value that will drift from every
other screen, and drifting values are what "too general" looks like from the
inside.

The exception, stated so it is not argued case by case: a value that is
genuinely one-off AND structural — a `flex: 1`, a `borderWidth: 1` — is not a
token. A *colour*, a *font size*, a *radius* or a *spacing step* always is.

## Contrast

| Content | Minimum |
|---|---|
| Body text on any background it can appear on | **4.5:1** |
| Large text (≥ `type.title`) and meaningful icons | **3:1** |
| A control's boundary against its surroundings | **3:1** |

Checked for:

- every `color.text` role against every `color.bg` role, **in both palettes**;
- `text.onAccent` against `intent.accent`, and `text.onDanger` against
  `intent.danger`, in both palettes;
- `text.onInterest` against **every colour the interest generator can produce** —
  the whole output space, not a sample (R7).

The last one is the point. R1 generates colours from a hash, so testing the
interests that happen to exist today would be a guard that answers nothing —
the same shape as a fixture asserting a search the flow never runs.

**Measured 2026-09-07**: 720 generated colours (360 hues × 2 depths) in each
palette, all passing. The test enumerates them every run rather than sampling.

## A token nobody applies is a colour nobody sees

Contrast checks that the tokens are legible **against each other**. It cannot
tell you a component forgot to use one — and `PostRow`'s caption did exactly
that, rendering the platform's black on a dark green surface.

So the contract has a second half, enforced by
`__tests__/text-has-colour.test.ts`: **every `<Text>` MUST choose a colour**,
directly or through a named style. Together the two mean "the theme is applied",
which neither means alone.

## Touch targets

Every interactive element MUST present at least **44×44** points (FR-020),
including elements whose visible art is smaller — padding counts, visible size
does not have to.

## Type

Five roles (FR-018): `display`, `title`, `body`, `label`, `caption`. Each fixes
size, line height and weight together; a caller picks a role, never a number.
Text MUST respect platform font scaling (FR-021), so no role may be expressed in
a unit that ignores it, and no container may be a fixed height that clips
scaled text.

## Theme resolution

- Two palettes, `light` and `dark` (FR-017), resolved by `useTheme()`.
- Both palettes define **every** token. A token defined in only one is a build
  failure, not a fallback — a missing dark value is how a screen ends up with
  black text on a black background.

## What tokens must not encode

- **Interest membership.** An interest colour is identity only. It MUST NOT be
  used to imply that something reaches a person's feed — Principle I, gate G1.
  A **place** and a **person** MUST NOT receive the interest treatment, because
  following a place deliberately does not put its posts in a feed (004/FR-019),
  and the UI must not suggest otherwise.
- **Meaning carried by colour alone** (FR-014). Every colour-coded thing carries
  its name too.
