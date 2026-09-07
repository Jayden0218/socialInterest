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
2. **Gives interests a visual identity** — a colour derived from the interest id,
   consistent everywhere, with sub-interests visibly related to their parent.
3. **Changes no navigation, no screen, no testID, no API call.** That is what
   keeps 19 Maestro flows and every browser journey passing, and it is the
   constraint the whole approach is built around.

## Technical Context

**Language/Version**: TypeScript 5.9, React 19, React Native via Expo SDK 54

**Primary Dependencies**: none added. R2 rejects a styling library; R5 rejects a
remote avatar service. If any dependency is proposed later it must be installed
with `expo install` if native — `pnpm add` took an incompatible module version
once and killed the app at registration.

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

**Structure decision**: everything lands in `apps/mobile`. No API, worker, infra
or contract file is touched — which is what makes FR-027 and FR-028 true by
construction rather than by review.

## Phasing

The order is forced by two things: the guard must exist before the change it
guards, and the shared card must exist before five surfaces adopt it.

| Phase | Contents | Gate to the next |
|---|---|---|
| **1. Guards first** | testID snapshot (R3), contrast test (R7), touch-target test (SC-007) | All three pass against the CURRENT code, so a later failure means the redesign broke something rather than that the guard is wrong |
| **2. Tokens** | palettes, type scale, spacing, elevation, `useTheme`, interest colour | Contrast test passes over the whole generated space |
| **3. Primitives** | Button, Banner, EmptyState, Row, Screen on tokens | Every existing mobile test still passes; testID snapshot unchanged |
| **4. The card** | `Avatar`, `InterestChip`, `Skeleton`, `PostCard` | `post-card.test.tsx` proves it renders media, author, interest and counts, and imports nothing from `data/` |
| **5. Adoption** | five post surfaces, then conversations, reviews, places, profile | testID snapshot unchanged; browser journeys pass |
| **6. Evidence** | recapture 20 screens; full CI step list; **emulator run** | G5 — not complete without the device run |

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
