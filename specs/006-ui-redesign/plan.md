# Implementation Plan: an interest-first visual system, and showing the media

**Branch**: `claude/spec-kit-integration-juhrza` | **Date**: 2026-09-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-ui-redesign/spec.md`

## Summary

The UI is "too general" for a reason that is checkable rather than aesthetic: **a
post in a list is one line of text**, and `Image` is imported by 2 of ~40
component files. The app is an interest-centred media product that shows neither
its media nor its interests.

This feature does two things and deliberately not a third:

1. **Shows the content** — a shared `PostCard` with media, author, avatar,
   interest chip and counts, on all five surfaces that list posts.
2. **Gives the product a brand** — a **dark green** theme (owner's direction,
   2026-09-07), expressed as one hue every green in the app derives from, with
   dark as the default palette.
3. **Gives interests a visual identity** — a colour derived from the interest id,
   consistent everywhere, with sub-interests visibly related to their parent.
4. **Changes no navigation, no screen, no testID, no API call.** That is what
   keeps 19 Maestro flows and every browser journey passing, and it is the
   constraint the whole approach is built around.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, React Native via Expo SDK 54

**Primary Dependencies**: none added. R2 rejects a styling library; R5 rejects a
remote avatar service. If any dependency is proposed later it must be installed
with `expo install` if native — `pnpm add` took an incompatible module version
once and killed the app at registration.

**Colour space**: OKLCH, converted to sRGB at module load by ~90 lines in
`ui/color.ts`. Not a preference — an interest's colour is generated from a hash
(R1), and HSL's `L` is a coordinate rather than lightness, so a fixed-`L` HSL
palette gives some interests legible chips and others not, decided by their id.
OKLab is perceptually uniform, which is what makes SC-004 hold by construction
instead of by luck. Gamut fitting reduces **chroma**, never clamps channels —
clamping shifts the hue and silently breaks the sub-interest families FR-012
depends on.

**Brand**: `BRAND_HUE = 152`, a deep forest green. Every green — surfaces,
accent, success, the tint under an interest chip — derives from it, because a hex
per green produces six greens that nearly match. Dark is the default palette.

**Storage**: N/A — no schema, no migration, no new field. Interest colour and
avatars are derived (R1, R5).

**Testing**: jest + `@testing-library/react-native` (mobile), jest + Playwright
against a real API (`apps/e2e`), Maestro on an Android emulator in CI.

**Target Platform**: Android (verified, 19/19 flows on run 34) and
`react-native-web` (a verification surface, so it must keep working). iOS has
never run and is out of scope.

**Project Type**: mobile app in a pnpm monorepo.

**Performance Goals**: a list must not shift as media loads (SC-006). No frame
rate target is claimed — nothing here has ever measured one, and inventing a
number would be worse than having none.

**Constraints**:
- Every existing `testID` preserved, enforced by a snapshot (R3).
- No behaviour change: no read path added, removed or bypassed.
- List images are **full-size** because no smaller rendition exists (R4). This is
  a known, recorded limitation, not an oversight.

**Scale/Scope**: ~40 component files, 20 screens, 5 surfaces that list posts, 178
testID literals and 39 dynamic prefixes that must survive.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 — see below.*

| Principle | Risk this feature introduces | Gate |
|---|---|---|
| **I. Interest Is the Organising Principle** (NON-NEGOTIABLE) | Giving places or people interest-like visual treatment would suggest they behave like interests. 004/FR-019 is explicit that following a place does NOT put its posts in your feed, and the screen says so in words today | **G1**: a place and a person MUST NOT receive the interest colour treatment. The existing `place-follow-hint` copy MUST remain visible and MUST NOT be demoted to a subtitle or an icon |
| **II. Visibility Is Decided Once** (NON-NEGOTIABLE) | A card that renders more fields could reach for data a list response does not carry, tempting a new read path | **G2**: `PostCard` renders ONLY fields already present in the post response. No new fetch, no per-row request, no client-side assembly. Enforced by a unit test that fails if the card imports anything from `data/` |
| **III. Privacy Enforced Server-Side** | An avatar or interest chip derived client-side could leak an identifier through a URL | **G3**: avatars and interest colours are computed locally from ids already in the response. No third-party request (R5). No new outbound host |
| **IV. Safety Ships With the Product** | Report and block are secondary controls; a redesign that "cleans up" a card is exactly how they become invisible | **G4**: report and block MUST remain reachable in the same number of taps as today on every surface, and their testIDs MUST resolve. `09-report-and-block` must pass unchanged |
| **V. Emulation Is Not Evidence** | Browser screenshots make a redesign look verified | **G5**: the browser capture pass is evidence the components render, NOT that the app works on a device. This feature touches every screen, so it MUST NOT be reported complete without an Android emulator run |

**Initial evaluation**: PASS. No gate is violated by the approach; each is a
condition on how it is carried out, and each is checkable.

**Post-design re-evaluation (after Phase 1)**: PASS, with one thing worth naming.
G2 is the gate most likely to be breached by accident: the natural way to show
"3 comments" on a card is to fetch comments. The contract addendum therefore
enumerates exactly which fields the card may read, and the guard fails on the
import rather than on the behaviour — the same shape as
`feed-does-not-read-place-follows.spec.ts`, which fails when the dependency
appears rather than waiting for a post to exercise it.

## Project Structure

### Documentation (this feature)

```text
specs/006-ui-redesign/
├── spec.md                       # 29 FRs, 9 SCs, 3 stories
├── plan.md                       # this file
├── research.md                   # R1-R9
├── data-model.md                 # the token model (no persistence)
├── quickstart.md                 # how to validate it
└── contracts/
    ├── design-tokens.md          # the token contract
    └── testid-preservation.md    # the contract with .maestro/
```

### Source code (repository root)

```text
apps/mobile/src/
├── ui/
│   ├── theme.ts                  # CHANGED: semantic tokens, two palettes
│   ├── tokens/                   # NEW: palette, type scale, spacing, elevation
│   ├── useTheme.ts               # NEW: resolves light/dark
│   ├── interest-colour.ts        # NEW: R1 derivation
│   └── primitives.tsx            # CHANGED: Button/Banner/EmptyState/Row/Screen
├── components/
│   ├── PostCard.tsx              # NEW: replaces PostRow (R8)
│   ├── Avatar.tsx                # NEW: R5
│   ├── InterestChip.tsx          # NEW
│   ├── Skeleton.tsx              # NEW: R6
│   └── PagedPostList.tsx         # CHANGED: skeleton empty/loading states
├── features/**/                  # CHANGED: consume tokens, not literals
└── screens/index.tsx             # CHANGED: PostRow removed, PostCard wired

apps/mobile/src/__tests__/
├── testid-snapshot.test.ts       # NEW: R3, the preservation guard
├── contrast.test.ts              # NEW: R7, whole generated space
├── touch-target.test.ts          # NEW: SC-007
└── post-card.test.tsx            # NEW: G2, and the card renders what it claims

apps/e2e/scripts/capture-screens.ts  # unchanged; re-run for before/after
docs/screens/                        # before set exists; after set added
```

**Structure decision**: everything lands in `apps/mobile` — **except three API
files, which is a departure from this plan as written and is recorded rather
than smoothed over.** `ports/object-store.port.ts`, `adapters/local/minio-object-store.ts`
and `modules/posts/post-query.service.ts` changed so a post's media URL is
presigned (research R4b). The plan claimed FR-027 and FR-028 were "true by
construction" because no API file would be touched; that is no longer the
argument for FR-027, and it was never going to hold, because the app could not
fetch its own media at all and SC-002 asks it to.

**FR-028 does still hold by construction**, and for a reason worth keeping: the
presigned URL is issued inside `PostQueryService.toMediaItem`, which runs only
after `VisibilityFilter` has already decided this viewer may see this post. No
read path was added — that was R4b's rejected option 2, rejected precisely
because Principle II would then require enumerating a new surface in the
matrix.

Four other files outside `apps/mobile` changed and are named for completeness,
none of them product API: `apps/api/scripts/smoke-boot.ts` (it exited 1 printing
nothing), `apps/e2e/journeys/negative.spec.ts` (N-04 had never tested the
guarantee it names — R4b), `apps/e2e/scripts/capture-screens.ts` and
`apps/e2e/support/publish.ts`.

## Phasing

The order is forced by two things: the guard must exist before the change it
guards, and the shared card must exist before five surfaces adopt it.

| Phase | Contents | Status | Gate to the next |
|---|---|---|---|
| **1. Guards first** | contrast test (R7), colourless-`Text` guard, testID snapshot (R3), touch-target test | **Done** — all four exist and pass | All must pass against the CURRENT code, so a later failure means the redesign broke something rather than that the guard is wrong |
| **2. Tokens** | palettes, type scale, spacing, radius, elevation, interest colour | **Done** | Contrast test passes over the whole generated space — 720 colours, both palettes |
| **3. Primitives** | Button, Banner, EmptyState, Row, Screen on tokens | **Done** — on the semantic tokens and the type roles, and `#d97706` was found hard-coded in `Banner` by reading, not by a test: the hard-coded-style guard was scoped to `features/` and `ui/` is where values are defined | Every existing mobile test still passes; testID snapshot unchanged |
| **4. The card** | `Avatar`, `InterestChip`, `Skeleton`, `PostCard` | **Done** | `post-card.test.tsx` proves it renders media, author, interest and counts, and imports nothing from `data/` |
| **5. Adoption** | five post surfaces, then conversations, reviews, places, profile | **Done** — and the ALIAS LAYER IS DELETED, so a return to `theme.color.*` is a typecheck failure rather than a lint opinion | testID snapshot unchanged; browser journeys pass |
| **6. Evidence** | recapture 20 screens; full CI step list; **emulator run** | Screens recaptured with the before/after pair (`docs/screens/README.md`); full CI step list green; **device run dispatched, result recorded in `docs/verification/runs/`** | G5 — not complete without the device run |

### What actually exists, as of 2026-09-08

Recorded here because a plan that describes only intentions is the thing this
project keeps finding out is wrong. Committed and green:

| | |
|---|---|
| `ui/color.ts` | OKLCH→sRGB, gamut fitting, WCAG contrast, `stableHash` (FNV-1a) |
| `ui/tokens.ts` | Both palettes, type scale, space, radius, elevation, `MIN_TOUCH_TARGET` |
| `ui/interest-colour.ts` | Hue from id, parent hue for sub-interests, whole-space enumeration |
| `ui/theme.ts` | `activePalette` only. The alias layer is DELETED — see below |
| `ui/primitives.tsx` | Button, Banner, EmptyState, Row, Screen on semantic tokens and type roles |
| `components/PostCard.tsx` | The shared card, on all five post surfaces (+ `Avatar`, `InterestChip`, `Skeleton`) |
| 12 of the 17 files in `__tests__/`, added by 006 | contrast (both palettes, 720 interest colours), colourless-`Text`, testID snapshot, touch target, stable hash, post-card, `post-card-reads-nothing`, interest colour, interest chip, `interest-treatment` (G1), `no-hardcoded-style`, safety and empty states |

Verified: **143 mobile tests**, 815 API, 6 workers, 129 e2e across 21 suites, 4
durability, typecheck, lint, `verify-maestro-ids`, generated-client diff,
`smoke:boot`, `verify:stack`, `synth`, `verify:register` — the real CI step
list, not a proxy for it.

### The alias layer was a migration step, and it is gone

`theme.color.bg` / `theme.font.md` existed so ~40 screens could be re-pointed at
the new palette in one diff. Every call site has since moved to the semantic
names, and the shim was then **deleted rather than left exported**: a name that
does not exist is a typecheck failure the moment somebody writes it again, which
is a stronger guard than a test asserting nobody did.

The migration was not only a rename, which is why it was worth finishing rather
than deferring a third time. **`theme.font.X` carried a size and nothing else**,
so every screen outside `ui/` rendered with the platform's default line height
and the scale's `lineHeight` was dead data everywhere except `primitives.tsx`.
FR-018 asks for roles; the app was using a quarter of one.

One consequence to state plainly rather than leave implied: `useTheme()` still
returns `activePalette` and **does not follow the platform**. Screens read the
palette at module scope, and a style object built once at import time cannot
call a hook — so following `useColorScheme()` needs every screen to build its
styles *inside* the component, which is a change of shape rather than of names.
FR-017 is met (both palettes exist and both pass contrast); a working light mode
is not claimed.

### Two defects found by looking at a screenshot

Both are recorded because neither was catchable by the contrast test, and the
distinction is the useful part.

1. **`PostRow`'s caption had no style at all**, so it inherited the platform's
   black — invisible luck under the old white theme, near-black on near-black
   against green. The contrast test checks that TOKENS are legible against each
   other; a token nobody applies is a colour nobody sees. `text-has-colour`
   closes that half.
2. **The page below the app was white.** `#root` in the hand-rolled web shell is
   a block container, and react-native-web renders the app root as `flex: 1`,
   which sizes to content in a block parent. **A harness artefact, not a product
   defect** — the native root always fills — fixed so captures show what a device
   shows.

And one process failure worth the same treatment: `capture-screens.ts` did not
build the bundle it served, so the first capture after changing the entire theme
produced twenty screenshots of the *old* design. It looked exactly like evidence.

**Note on phase 1**: a guard that asserts ABSENCE can precede the code it guards;
one that asserts PRESENCE cannot. All three phase-1 guards assert properties of
what already exists, so they can go first — which is the point.

## Risks, and what each would cost

| Risk | Why it is real here | Mitigation |
|---|---|---|
| A testID is lost in a large diff | The redesign touches nearly every component | R3's snapshot fails the build, in seconds, instead of a 25-minute emulator run |
| Safety controls become invisible | "Cleaning up" a card is exactly how a Report button becomes an icon nobody finds | G4, plus `09-report-and-block` passing unchanged |
| The card reaches for more data | Showing counts tempts a fetch | G2's import guard |
| Full-size images make the feed slow | R4: there is no thumbnail rendition | Recorded as FR-008 unmet, with a scoped follow-up. NOT reported as met |
| A browser screenshot is mistaken for verification | It looks exactly like evidence | G5, stated in the run record as well as here |
| Dark mode ships half-done | Every token needs a pair, and screens hard-code values today | Contrast test covers BOTH palettes; hard-coded values are what phase 3 removes |

## Complexity Tracking

No constitutional violation requires justification. The one deliberate
simplification worth recording: **FR-008 is knowingly left unmet** (R4), because
meeting it means pipeline work the chosen scope excluded. It is recorded in the
spec, in research, in this plan and — required — in the run record, rather than
being dropped quietly.
