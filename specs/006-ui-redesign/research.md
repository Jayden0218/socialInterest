# Phase 0 — Research: interest-first visual system

Nine decisions. Each records what was chosen, why, and what was rejected, so a
later reader does not re-litigate one without seeing the reason.

Everything below was checked against the code on 2026-09-07, not recalled.

---

## R1 — Interest colour is DERIVED from the interest id, never stored

**Decision**: hash the interest's stable id to a hue, and pair it with
lightness/chroma values fixed by the theme. A sub-interest inherits its parent's
hue and shifts lightness, so the family is visible.

**Rationale**:

- A stored colour needs a migration, an editing surface, and a decision about who
  may change it. None of that was asked for.
- Derived means every client computes the same colour with no round trip, and the
  API contract does not change (FR-027).
- Sub-interest hue inheritance makes 001/FR-024's roll-up — a sub-interest's
  posts appear in the parent — visible rather than merely true.

**Alternatives rejected**:

- *Store a colour per interest*: a schema change, a moderation surface (an
  interest is user-creatable), and two clients could disagree mid-migration.
- *A fixed palette assigned by creation order*: two interests created in
  different orders on different environments get different colours, so a
  screenshot in a bug report would not match what anyone else sees.

**Consequence to accept**: two unrelated interests can collide on a similar hue.
That is why FR-014 requires the name to always be present — colour is
reinforcement, never the identifier.

---

## R1b — The brand is a dark green, expressed as a HUE

**Decision** (owner's, 2026-09-07): the theme is dark green. Implemented as a
single `BRAND_HUE = 152` from which every green in the product derives —
surfaces, accent, success, and the tint under an interest chip.

**Rationale**: a hex per green produces six greens that nearly match. One hue at
different lightness and chroma is a family by construction. Dark is the default
palette, because a brand that only appears after a setting is found is not one.

**Consequence, and the reason R1 had to change**: an interest hue that ignored
the brand would fight it. Interest colours keep the full 360° hue range —
FR-011 needs interests to be distinguishable — but take their **lightness and
chroma from the palette**, so every chip sits at the same depth as the green
surfaces around it and none of them shouts.

**Measured, not asserted**: with lightness fixed, all **720** generated interest
colours (360 hues × 2 depths) pass WCAG AA against `text.onInterest`, in both
palettes. The contrast test checks all of them, every run.

---

## R2 — Extend `theme.ts` into a token module with two palettes; do not add a styling library

**Decision**: grow `apps/mobile/src/ui/theme.ts` into semantic tokens
(`color.surface.raised`, `text.primary`, …) with a light and a dark palette
resolved by a `useTheme()` hook. No `styled-components`, `nativewind`, or
`tamagui`.

**Rationale**:

- The app must keep rendering under `react-native-web` (FR-029) because the
  browser journeys are a verification surface. Every additional styling runtime
  is another thing that can behave differently between the two.
- `CLAUDE.md` records that Expo native modules must be installed with
  `expo install`, not `pnpm add` — a version mismatch killed the app at module
  registration once. A styling library with a native component is that risk for
  no gain here.
- The existing screens already import `theme`; extending it means the diff is
  mostly *values*, not a rewrite of every file.

**Alternatives rejected**:

- *NativeWind / Tailwind for RN*: a build-step dependency and a second source of
  truth for spacing, for an app with ~40 components.
- *Per-screen StyleSheets*: what exists now, and what produced ad-hoc values.

---

## R3 — testID preservation is enforced by a SNAPSHOT, not by care

**Decision**: add a guard that extracts every `testID` literal and dynamic prefix
from `apps/mobile/src` and compares the set against a committed snapshot.
Additions are allowed; removals and renames fail the build.

**Rationale**:

- FR-025 is the constraint the whole scope answer rests on: 19 Maestro flows and
  the browser journeys select on these. `verify-maestro-ids` checks the other
  direction — that every *selector* resolves — so a testID deleted along with the
  flow that used it would pass both today.
- This repository has the precedent and the scar: `auth-surface.spec.ts`
  enumerates every route and compares to a snapshot **in both directions**,
  because a hand-picked list only covers mistakes already made.
- A redesign touches nearly every component. "We were careful" is not a control.

**Alternatives rejected**:

- *Rely on `verify-maestro-ids`*: it proves selectors resolve, not that testIDs
  survived. A flow and its testID deleted together is invisible to it.
- *Rely on the Maestro run*: true, but 25 minutes per answer, and this repository
  has already paid three device runs this week for facts a static check settles.

---

## R4 — There is NO small image rendition, and FR-008 cannot be met without pipeline work

**Decision**: implement FR-001 using `renditions.original`, and record **FR-008
as not met**, with a scoped follow-up rather than silent pipeline work.

**Evidence** (`apps/workers/src/media-image/handler.ts:56`):

```
renditions: { original: derivedKey }
```

An image post has exactly one rendition — the EXIF-stripped derived image, at
full size. Video has `hls` plus `posterUrl`. So a feed that renders images today
downloads full-size originals.

**Why not just add a thumbnail now**: the scope chosen was "visual system + show
the media", explicitly not pipeline work. Adding a rendition means a worker
change, a new key in the contract, a backfill decision for existing posts, and a
processing-state question — a feature-sized change wearing a small change's
clothes.

**Why not silently ship full-size images**: on a real network that is the
difference between a feed that works and one that does not, and reporting FR-008
as met because the images appeared would be exactly the kind of claim this
project's records exist to prevent.

**Recommended follow-up** (out of this feature): add `thumb` (≈600px wide) in
`handleImageJob`, fall back to `original` when absent so old posts keep working.

**Gate**: the run record for this feature MUST state that list images are
full-size, and MUST NOT report FR-008 as met.

---

## R4b — MEDIA CANNOT BE FETCHED BY A CLIENT AT ALL. SC-002 is blocked.

**Found 2026-09-07, by `PostCard` being the first thing that ever put an image on
a browse surface.** The frame rendered and stayed empty.

`MinioObjectStore.publicUrl(key)` returns an **unsigned** URL, and the local
MinIO bucket is private, so every `<img src>` gets 403. Media has therefore never
displayed anywhere — not in the browser, and not on Android, where the device
flows assert API calls rather than pixels and `PostDetailScreen`'s `Image` was
never looked at.

**I tried the obvious fix and it was wrong.** Granting the local bucket anonymous
`s3:GetObject` made the images appear — and broke `N-04`, which asserts that an
unsigned fetch of a **private** post's media key is refused. That is Principle III
enforced server-side, and a screenshot is not worth a privacy regression. Reverted,
and N-04 is green again.

**The real gap this exposes**: `publicUrl` is only correct where something else
authorises the read — a CDN with signed URLs, which is what the deleted `aws`
adapters would have done. On the local profile nothing does, so the product has
no working media read path. Two honest options, both API work and both outside
006's stated scope:

1. **Presigned GET URLs**, generated only for a viewer who already passed
   `VisibilityFilter`, time-limited. Smallest change; keeps the object store the
   only thing serving bytes.
2. **A media endpoint that consults `VisibilityFilter`** and streams. One more
   read path, which Principle II says must be enumerated in the matrix.

**Consequence for this feature, stated rather than worked around**: FR-001 is
implemented and `PostCard` renders whatever URL it is given — provable by unit
test — but **SC-002 ("media is reachable from every browse surface, verified by
rendering") is NOT MET** and cannot be until the above is decided. It must be
reported that way.

---

## R5 — Avatars are generated from identity; no upload path is added

**Decision**: an `Avatar` component rendering the person's initials on their
derived colour, using the same hash function as R1 seeded by `userId`.

**Rationale**: FR-009 asks that a person be visually identifiable everywhere they
are named. No avatar upload exists, and adding one is storage, moderation
(Principle IV), and a new endpoint — a separate feature. A stable generated
avatar meets the requirement now and is replaced by an image later without
touching any call site.

**Alternatives rejected**: *Gravatar or any remote service* — it would leak an
identifier to a third party on every render, for a product whose constitution is
about not disclosing things.

---

## R6 — Layout stability comes from the contract's `width`/`height`, not from guessing

**Decision**: reserve space using the `width`/`height` already on `MediaItem`,
falling back to a fixed aspect ratio when absent. Loading states are skeletons in
the shape of the card.

**Rationale**: FR-005 and SC-006 forbid a list that shifts as media loads.
`mediaItemSchema` already carries optional `width`/`height`, so the aspect ratio
is known before the image arrives. A spinner on an empty screen tells a person
nothing about what is coming.

**Consequence**: when `width`/`height` are absent the fallback ratio may crop or
letterbox. That is a visible compromise, and is preferable to a jumping list.

---

## R7 — Contrast is checked MECHANICALLY, over the whole generated space

**Decision**: a unit test computes WCAG contrast for every token pair in both
palettes **and for every interest colour the hash can produce**, and fails below
4.5:1 for body text and 3:1 for large text.

**Rationale**:

- R1 generates colours from a hash. Sampling a few interests would test the ones
  that happen to exist, which is the shape of a guard that answers nothing — the
  same mistake as a fixture asserting a search the flow never runs.
- The generator's output space is finite and small; checking all of it is cheap
  and is the only way "every interest colour is legible" can be a fact.

**Alternatives rejected**: *eyeball it in the screenshots* — accessibility is not
a matter of opinion, and dark mode doubles the surface.

---

## R8 — One `PostCard`, replacing `PostRow`, used by every list

**Decision**: a single card component consumed by the feed, interest spaces,
profiles, saved and place pages. `PostRow`'s `post-${postId}` and `post-caption`
testIDs move onto it unchanged.

**Rationale**: today `PostRow` is a `Pressable` around one `Text`. Five surfaces
render posts; five hand-written cards would be five places for the author, the
counts or the interest chip to be forgotten — this codebase has shipped that
exact defect **seven times** (a persistence row escaping as a response) and once
more as two notification-category lists. One component is the same argument as
one `VisibilityFilter`, applied to presentation.

**Constraint carried over**: `PostRow` was once bare `Text` and tapping it did
nothing, making post detail unreachable from every list. The card must remain
pressable across its whole surface, and the browser journey that catches this
must keep passing.

---

## R9 — Verification is the existing suites, plus a before/after screenshot pass

**Decision**: correctness is proven by the suites that already exist (they assert
behaviour, which must not change); the *visual* result is evidenced by
re-running `apps/e2e/scripts/capture-screens.ts` and keeping both sets.

**Rationale**: `docs/screens/` already holds 20 captures of the current UI from a
real API. Recapturing after the change makes the redesign reviewable rather than
described.

**Stated limit, which must be repeated in the run record**: those captures are
`react-native-web` in Chromium, **not** native Android frames (Principle V —
emulation is not evidence). A screenshot pass proves the components render; only
the emulator run proves the app still works on a device, and this feature touches
every screen it has.
