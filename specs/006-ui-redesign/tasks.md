---

description: "Task list for feature 006: an interest-first visual system, and showing the media"
---

# Tasks: an interest-first visual system, and showing the media

**Input**: Design documents from `/specs/006-ui-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: **Included, and not optional.** The constitution requires that "a stated
numeric criterion MUST have a task that measures it. A criterion with an
implementation but no measurement is not met, it is merely attempted." SC-004,
SC-005, SC-006 and SC-007 are all mechanical checks, and each has a measuring
task named below.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency)
- **[Story]**: US1, US2, US3
- Exact file paths in every task

## Path conventions

Everything lands in `apps/mobile`. No API, worker, infra or contract file is
touched — which is what makes FR-027 (no API change) and FR-028 (no behaviour
change) true by construction rather than by review.

## Single-owner files

Two agents editing these overwrite each other. Tasks touching them are
**sequential**, never `[P]`:

| File | Why |
|---|---|
| `apps/mobile/src/screens/index.tsx` | Every container in the app lives here. Five US1 tasks and three US3 tasks touch it |
| `apps/mobile/src/ui/theme.ts` | The alias layer; changing its shape moves ~40 call sites |
| `apps/mobile/src/ui/tokens.ts` | One palette. Two writers disagree about a colour and the contrast test reports the loser |

## The gates, restated

From plan.md. Each blocks work that would otherwise look ready:

| Gate | Blocks | Enforced by |
|---|---|---|
| **G1** | interest treatment leaking onto places and people | **T031** — a place-follow does not reach a feed (004/FR-019), and the UI must not imply it does |
| **G2** | `PostCard` fetching anything | **T017** — fails on the import, not on the behaviour |
| **G3** | any third-party request for an avatar or colour | **T017**, plus review: no new outbound host |
| **G4** | safety controls becoming invisible | **T041** — report and block reachable in the same taps |
| **G5** | claiming this is done without a device run | **T045** — an emulator run, or it is not complete |

---

## Phase 1: Setup

**Purpose**: establish the baseline the rest of the feature is measured against.
Nothing to install — this feature adds no dependency (R2, R5).

- [X] T001 Record the pre-change baseline by running `pnpm --filter @sih/mobile test`, `pnpm --filter @sih/e2e test`, `pnpm typecheck`, `pnpm lint` and `node scripts/verify-maestro-ids.mjs` — **done 2026-09-07**: 71 mobile, 129 e2e/21 suites, 150 selectors, 178 literals, 39 prefixes
- [X] T002 Capture the BEFORE screenshots into `docs/screens/` with `apps/e2e/scripts/capture-screens.ts` — **done**, 20 screens, and the script now builds the bundle it serves (the first run after a theme change produced 20 screenshots of the old design)

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: the guards, and the token layer every story reads.

**⚠️ No user story work begins until this phase completes.** In particular
**T006 blocks Phase 5 entirely** — adoption touches nearly every component, and
without the snapshot a lost testID is found by a 25-minute emulator run.

### Guards, before the code they guard

A guard asserting ABSENCE can precede the code it guards; one asserting PRESENCE
cannot. All four below assert properties of what already exists, so they go first.

- [X] T003 Add `apps/mobile/src/__tests__/contrast.test.ts` checking WCAG AA for both palettes and **all 720 generated interest colours** — **done**. Failed on its first run (light `text.muted` 4.24 vs 4.5) and the token was darkened; SC-004
- [X] T004 Add `apps/mobile/src/__tests__/text-has-colour.test.ts` failing on any `<Text>` that chooses no colour — **done**, and verified by reverting the caption fix and watching it name the line. Contrast checks that TOKENS are legible; this checks one was applied
- [ ] T005 [P] Add `apps/mobile/src/__tests__/touch-target.test.ts` asserting every `Pressable`/`Button` presents at least `MIN_TOUCH_TARGET` (44) including padding — **SC-007**, FR-020
- [ ] T006 Add `apps/mobile/src/__tests__/testid-snapshot.test.ts` extracting every `testID` literal and dynamic prefix from `apps/mobile/src` and comparing to a committed snapshot, per `contracts/testid-preservation.md` — additions pass, removals and renames fail. **Verify it fails** by renaming one testID before committing; **SC-005**

### The token layer

- [X] T007 Add `apps/mobile/src/ui/color.ts` — OKLCH→sRGB with gamut fitting by chroma reduction, WCAG contrast from the RENDERED hex, and `stableHash` (FNV-1a) — **done**
- [X] T008 Add `apps/mobile/src/ui/tokens.ts` — `BRAND_HUE = 152`, both palettes, five type roles, space, radius, elevation, `MIN_TOUCH_TARGET` — **done**
- [X] T009 Add `apps/mobile/src/ui/interest-colour.ts` — hue from id, parent's hue for a sub-interest, and `everyInterestColour()` for T003 — **done**
- [X] T010 Re-point `apps/mobile/src/ui/theme.ts` at the palette as an alias layer, so ~40 files turn dark green in one diff — **done**
- [ ] T011 Add `apps/mobile/src/ui/useTheme.ts` resolving `light`/`dark` from the platform colour scheme, defaulting to dark — **FR-017**. Every token must exist in both palettes; a token defined in one only is a build failure, not a fallback
- [ ] T012 Pin `stableHash` in `apps/mobile/src/__tests__/stable-hash.test.ts` with literal expected values — it decides every interest's colour, so changing it recolours every screenshot, bug report and person's memory at once

**Checkpoint**: tokens exist, four guards pass against current code, and a lost testID now fails the build.

---

## Phase 3: User Story 1 — A person sees what was posted (Priority: P1) 🎯 MVP

**Goal**: the feed shows photographs and videos with who posted them and which
interest they belong to, instead of a list of captions.

**Independent Test**: open the feed with posts whose media is ready; the media
renders with author and interest, and tapping still opens the post.

**Why this is the MVP**: it is the largest gap between what the product is and
what it shows, on the first screen anyone sees. `PostRow` is currently a
`Pressable` around one `Text`.

### Tests for US1

- [ ] T013 [P] [US1] Test in `apps/mobile/src/__tests__/post-card.test.tsx` that `PostCard` renders media, author, avatar, interest and counts for a ready post — FR-001 to FR-004
- [ ] T014 [P] [US1] Test in `apps/mobile/src/__tests__/post-card.test.tsx` that a `pending` post renders a skeleton occupying the **same height** as a ready one, asserted as a measured height rather than by eye — FR-005, **SC-006**
- [ ] T015 [P] [US1] Test in `apps/mobile/src/__tests__/post-card.test.tsx` that a post with no media renders a text card and a `failed` post says so, rather than either showing an empty frame — FR-007
- [ ] T016 [P] [US1] Test in `apps/mobile/src/__tests__/post-card.test.tsx` that a video renders its `posterUrl` and is identifiable as a video without playing — FR-006
- [ ] T017 [US1] Guard in `apps/mobile/src/__tests__/post-card-reads-nothing.test.ts` failing if `PostCard.tsx` imports from `src/data/`, calls `fetch`, or takes a callback that does — **G2, G3**; fails on the dependency appearing, like `feed-does-not-read-place-follows.spec.ts`

### Implementation for US1

- [ ] T018 [P] [US1] Create `apps/mobile/src/components/Skeleton.tsx` — a shaped placeholder, sized by the caller, no spinner
- [ ] T019 [P] [US1] Create `apps/mobile/src/components/Avatar.tsx` — initials on the person's derived colour, seeded by `userId`, no network request ever (R5, G3)
- [ ] T020 [US1] Create `apps/mobile/src/components/PostCard.tsx` reading ONLY the fields data-model.md § "What the card may read" enumerates, reserving space from `media.width`/`height` with a fallback ratio (R6), and keeping `post-${postId}` and `post-caption` on the same elements they are on today
- [ ] T021 [US1] Replace `PostRow` with `PostCard` in `apps/mobile/src/screens/index.tsx` — **single-owner file**, sequential
- [ ] T022 [US1] Adopt `PostCard` on the interest space and profile surfaces in `apps/mobile/src/screens/index.tsx` — sequential after T021
- [ ] T023 [US1] Adopt `PostCard` on the saved and place-page surfaces in `apps/mobile/src/screens/index.tsx` — sequential after T022; **SC-001 requires all five, with zero left rendering a bare caption**
- [ ] T024 [US1] Render skeletons for the loading state in `apps/mobile/src/components/PagedPostList.tsx` instead of a spinner on an empty screen — FR-023
- [ ] T025 [US1] Verify `docs/screens/03-home-feed.png`, recaptured, shows media and authors — and record that list images are **full-size** because no smaller rendition exists (R4)

**Checkpoint**: the feed shows what was posted. FR-008 remains **not met** and must be reported that way.

---

## Phase 4: User Story 2 — An interest looks like a place (Priority: P2)

**Goal**: interests are distinguishable at a glance and a post carries a visible
mark of the interest it belongs to.

**Independent Test**: open two different interest spaces; they are visually
distinguishable without reading the title.

**Depends on US1** only for `PostCard` existing (T020). The interest chip and the
interest-space chrome are independent of it.

### Tests for US2

- [ ] T026 [P] [US2] Test in `apps/mobile/src/__tests__/interest-colour.test.ts` that the same interest id always yields the same colour, and that two different ids usually differ — FR-011
- [ ] T027 [P] [US2] Test in `apps/mobile/src/__tests__/interest-colour.test.ts` that a sub-interest takes its PARENT's hue at a different lightness, so a family is visible — FR-012, and 001/FR-024's roll-up made legible
- [ ] T028 [P] [US2] Test in `apps/mobile/src/__tests__/interest-chip.test.tsx` that an interest is never identified by colour alone: wherever a chip renders, its NAME renders too — FR-014

### Implementation for US2

- [ ] T029 [P] [US2] Create `apps/mobile/src/components/InterestChip.tsx` — the derived colour with the name always present, meeting the touch target when it is pressable
- [ ] T030 [US2] Render interest chips on `PostCard` in `apps/mobile/src/components/PostCard.tsx` — FR-003, FR-013
- [ ] T031 [US2] Carry the interest's identity into the interest space chrome in `apps/mobile/src/features/discover/InterestScreen.tsx`, and **do not** give a place or a person the same treatment — **G1**. `place-follow-hint` stays visible and stays words, not an icon
- [ ] T032 [US2] Show interest colours in discovery results in `apps/mobile/src/features/discover/InterestSearchScreen.tsx` — FR-013
- [ ] T033 [US2] Verify SC-003 by re-running `apps/e2e/scripts/capture-screens.ts` and confirming `docs/screens/06-interest-space.png` and a second interest space are distinguishable with the titles removed

**Checkpoint**: the product's premise is visible, and has not leaked onto things that are not interests.

---

## Phase 5: User Story 3 — The product reads as one product (Priority: P3)

**Goal**: every screen shares the type scale, spacing rhythm and component
vocabulary, and works in both light and dark.

**Independent Test**: the 20 captured screens, recaptured, are visibly one system.

**⚠️ Blocked by T006.** This phase touches nearly every component; without the
testID snapshot a rename is found by an emulator run.

### Tests for US3

- [ ] T034 [P] [US3] Guard in `apps/mobile/src/__tests__/no-hardcoded-style.test.ts` failing on a literal colour (`#rrggbb`, `rgb(`) or a raw font size in `src/features/**` — FR-016. Structural values (`flex: 1`, `borderWidth: 1`) are explicitly allowed, per `contracts/design-tokens.md`
- [ ] T035 [P] [US3] Extend `apps/mobile/src/__tests__/contrast.test.ts` to assert every token exists in BOTH palettes, so a missing dark value is a failure and not a silent fallback — FR-017

### Implementation for US3

- [ ] T036 [US3] Move `Button`, `Banner`, `EmptyState`, `Row`, `Screen` in `apps/mobile/src/ui/primitives.tsx` onto semantic tokens and the type roles — **single-owner file**
- [ ] T037 [P] [US3] Adopt tokens in `apps/mobile/src/features/conversations/` — Inbox, Conversation, NewGroup
- [ ] T038 [P] [US3] Adopt tokens in `apps/mobile/src/features/places/` — PlaceScreen, RatingControl, ReviewList
- [ ] T039 [P] [US3] Adopt tokens in `apps/mobile/src/features/profile/`, `notifications/`, `engagement/`, `posts/`, `publish/`, `safety/`
- [ ] T040 [US3] Adopt tokens in `apps/mobile/src/screens/index.tsx` and `App.tsx` — **single-owner files**, sequential after T037–T039
- [ ] T041 [US3] Confirm report and block are reachable in the same number of taps on every surface, by running `.maestro/09-report-and-block.yaml` and `node scripts/verify-maestro-ids.mjs` against `apps/mobile/src/features/safety/` — **G4**; `09-report-and-block` must pass unchanged
- [ ] T042 [US3] Keep every distinct empty-state message in `apps/mobile/src/features/feed/HomeFeedScreen.tsx` and `apps/mobile/src/features/conversations/InboxScreen.tsx`; the redesign must not collapse them into one generic line — FR-024

**Checkpoint**: one system, in two palettes, with safety controls where they were.

---

## Phase 6: Polish & evidence

- [ ] T043 Recapture the 20 screens with `apps/e2e/scripts/capture-screens.ts` and keep the before/after pair — **SC-008**
- [ ] T044 Run the real CI step list from `.github/workflows/ci.yml` — not a proxy for it. Run `@sih/e2e` ALONE: it boots and kills its own API, and two concurrent invocations produce a page of `fetch failed` that looks like a product failure
- [ ] T045 Dispatch `.github/workflows/android-emulator.yml` and record the result — **G5**. Free on this public repository, and the only place native layout, fonts, safe areas and touch handling are observed. **Expected 19/19**; a redesign touching every screen is exactly what a device run is for
- [ ] T046 [P] Write the run record in `docs/verification/runs/`, naming each criterion with the command that measured it, and each criterion NOT met — **FR-008 must appear there as unmet**
- [ ] T047 [P] Update `CLAUDE.md` with what 006 established and what it did not
- [ ] T048 Re-check `spec.md`, `plan.md`, `research.md` and `contracts/` for drift against what was actually built — the artifacts drifted once already this feature and it was noticed by the owner, not by me

---

## Dependencies & execution order

### Phase dependencies

- **Setup (1)**: done.
- **Foundational (2)**: **T006 blocks Phase 5.** T011 blocks T035. Otherwise Phase 2 blocks all stories.
- **US1 (3)**: needs Phase 2. Delivers the MVP alone.
- **US2 (4)**: needs T020 (`PostCard`) for T030 only; T029, T031, T032 are independent of US1.
- **US3 (5)**: needs T006. Touches every file, so it goes last of the three.
- **Polish (6)**: needs whichever stories are being shipped.

### Story dependencies

- **US1** is independent and is the MVP.
- **US2** depends on US1 for one task (T030) and is otherwise independent.
- **US3** depends on neither, but is scheduled last because it edits the same files US1 and US2 do, and doing it first would mean doing it twice.

### Parallel opportunities

Genuinely independent, and worth stating precisely because this repository has
measured that it does **not** decompose widely:

- **T005 + T006** — different files.
- **T013–T016** — one file, but written together before implementation.
- **T018 + T019** — `Skeleton` and `Avatar`, different files.
- **T026–T028** — pure functions, no UI.
- **T037 + T038 + T039** — three disjoint feature directories. This is the widest
  fan-out in the feature and it is three.

Everything touching `screens/index.tsx` (T021, T022, T023, T040) is sequential.

---

## Implementation strategy

### MVP: Phase 2 + US1

The feed showing what was posted is the whole complaint. Stop after T025,
recapture, and look at it before deciding whether US2 and US3 are worth it.

### Incremental

1. Phase 2 → guards hold, tokens exist, app is already dark green (T010 shipped).
2. US1 → **the feed shows media**. Recapture. Demo.
3. US2 → interests become places you can tell apart. Recapture.
4. US3 → one system in two palettes.
5. Phase 6 → device run, records, drift check.

### What "done" does not mean

- **FR-008 is not met** and no phase meets it. List images are full-size; adding a
  thumbnail rendition is worker work this feature's scope excluded (R4).
- **A browser screenshot is not evidence about a device.** T043 makes the change
  reviewable; T045 is what makes it verified. Principle V.
