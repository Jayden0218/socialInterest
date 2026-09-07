# Phase 1 — Data model

**There is no persistence in this feature.** No table, no item type, no key, no
migration, no API field. That is a design property, not an omission: interest
colour and avatars are derived (R1, R5), so nothing has to be written, backfilled
or kept in sync between clients.

What follows is the *token* model — the values the UI is built from — and the
derivation rules that must produce identical results on every client.

## Token groups

| Group | Roles | Notes |
|---|---|---|
| `color.bg` | `base`, `raised`, `sunken` | Three surface depths; `raised` is what a card sits on |
| `color.text` | `primary`, `secondary`, `muted`, `onAccent`, `onInterest` | Every role has a checked pair against every background it may appear on |
| `color.line` | `hairline`, `strong` | Borders and dividers |
| `color.intent` | `accent`, `danger`, `warning`, `success` | `danger` already exists and is used by Leave and Report |
| `type` | `display`, `title`, `body`, `label`, `caption` | Size, line height and weight per role (FR-018) |
| `space` | `xs`…`xxl` | Extends today's 5 steps; the rhythm every screen uses |
| `radius` | `sm`, `md`, `lg`, `pill` | |
| `elevation` | `flat`, `raised`, `overlay` | Must degrade sanely under react-native-web (FR-029) |

Every group resolves through `useTheme()` to one of two palettes, `light` and
`dark` (FR-017). A screen may not hard-code a value any group defines (FR-016).

## Derivations

These are the only two computed values, and both must be **pure and stable** —
the same input gives the same output on every device, every session, forever.
A person comparing two phones must see the same colours.

### Interest colour (R1)

```
hue        = stableHash(interestId) mod 360
parentHue  = interest.parentId ? stableHash(parentId) mod 360 : hue
```

| Rule | Requirement |
|---|---|
| A top-level interest uses its own hue | FR-011 |
| A sub-interest uses its **parent's** hue at a different lightness | FR-012 — the family must be visible, which is 001/FR-024's roll-up made legible |
| Lightness and chroma come from the theme, not the hash | Keeps every generated colour inside the checked contrast range |
| The pairing with `text.onInterest` meets contrast in BOTH palettes | FR-015, checked over the whole output space (R7) |
| The interest NAME is always rendered alongside the colour | FR-014 — colour is reinforcement, never the identifier |

`stableHash` must be a plain, documented function of the string — not
`Object.hashCode`, not anything whose output could vary by engine or version.

### Avatar (R5)

```
initials = first grapheme of displayName, uppercased
hue      = stableHash(userId) mod 360
```

Same generator as the interest colour, seeded by `userId`. No network request,
ever (G3). Replaced by a real image later without changing any call site.

## What the card may read

This is the enforceable half of gate **G2**, and it is a list rather than a
principle so that a violation is a diff rather than a judgement.

`PostCard` may read **only** these, all already present in the post response:

`postId`, `caption`, `author` (`userId`, `handle`, `displayName`), `interests[]`
(`interestId`, `name`, `slug`, `level`, `parentId` where present), `media[]`
(`kind`, `processingState`, `width`, `height`, `posterUrl`, `renditions`),
`reactionCount`, `commentCount`, `createdAt`, `visibility`, `processingState`.

It may **not** import from `apps/mobile/src/data/`, call any fetch, or take a
callback that performs one. A count it cannot read is a count it does not show.

## State, and what each state must look like

`processingState` already exists on the contract; the redesign gives each value a
distinct appearance instead of the current silence.

| State | What the card shows | Requirement |
|---|---|---|
| `ready` | The media | FR-001 |
| `pending` / `processing` | A skeleton occupying the **same** space | FR-005, SC-006 |
| `failed` | A stated failure, not an empty frame | FR-007's sibling; a failed post is visible only to its author, who is the one person who needs to know |
| no media at all | A deliberate text card | FR-007 |

Space is reserved from `width`/`height` on the media item, falling back to a
fixed ratio when absent (R6).
