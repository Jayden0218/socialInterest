# Contract: the design tokens

**Status**: binding. Enforced by `apps/mobile/src/__tests__/contrast.test.ts`
(R7) and `touch-target.test.ts`.

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
