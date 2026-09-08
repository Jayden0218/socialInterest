---

description: "Tasks for 007 — Ranked Feed and App Redesign"
---

# Tasks: Ranked Feed and App Redesign

**Input**: `specs/007-ranked-feed-redesign/` — plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Constitution**: 2.0.0. Gates G1–G7 are named in plan.md; the task that discharges each is marked.

**Tests**: included, because two contracts exist. Per the constitution, a test that enforces a
contract is written BEFORE the implementations it governs; other tests may follow.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelisable — different files, no dependency on an incomplete task
- **[Story]**: US1–US5 from spec.md

## Single-owner files — two agents editing these will overwrite each other

| File | Phases |
|---|---|
| `apps/api/src/modules/feed/feed.service.ts` | 2, 3 |
| `apps/api/tests/visibility/matrix.spec.ts` | 2, 3 |
| `apps/mobile/src/ui/tokens.ts` | 5 |
| `apps/mobile/src/screens/index.tsx` | 5, 6, 7 |
| `apps/e2e/support/client.ts` | 3, 4 |
| `.github/workflows/ci.yml` | 8 |

---

## Phase 1: Setup

- [ ] T001 Create the API module skeletons `apps/api/src/modules/signals/` and `apps/api/src/modules/ranking/` with empty Nest modules registered in `apps/api/src/app.module.ts`
- [ ] T002 [P] Add `SIGNAL_MAX_DWELL_MS = 30000`, `SIGNAL_MIN_DWELL_MS = 3000`, `SIGNAL_DECAY_HALF_LIFE_DAYS = 14` and `EXPLORE_EPSILON = 0.2` as named constants in `apps/api/src/modules/ranking/constants.ts` — research R2 and R5 chose values, not magic numbers
- [ ] T003 [P] Extend `packages/shared/openapi.yaml` with the signals and feed-explanation operations, then regenerate the client (`pnpm --filter @sih/shared generate:client`) so both sides come from one document

---

## Phase 2: Foundational — the withdrawals, and the guard that replaces them

**Runs BEFORE the ranked feed, deliberately.** If the ranked feed lands first, the FR-033
test fails and the pressure is to weaken it — which is exactly what RS-002 forbids. Deleting
it while the old feed still passes keeps the decision clean.

- [ ] T004 Write the ranking-boundary contract test at `apps/api/tests/unit/ranking-cannot-admit.spec.ts` implementing C1 (a dependency check: `apps/api/src/modules/ranking/**` may not import `VisibilityFilter`, `Viewer`, or any block repository) — **G4**, and it must pass trivially now and keep passing later
- [ ] T005 Write the behavioural half of the boundary contract at `apps/api/tests/integration/ranking-boundary.spec.ts` implementing C2–C5 from `contracts/ranking-boundary.md`. **C4 is the one that matters**: the served set is always a SUBSET of the proposed set — a ranker that drops a post is a bug, one that admits a post is a privacy failure
- [ ] T006 Delete `apps/api/tests/integration/us4-fr033-boundary.spec.ts` — **RS-002, deleted not weakened**. A softened version would assert a boundary the product no longer has and would read as coverage
- [ ] T007 Delete `apps/e2e/scripts/seed-fr033-fixture.ts` and remove its references from `apps/e2e/journeys/feed.spec.ts` and `apps/e2e/browser/authenticated.spec.ts` — RS-003
- [ ] T008 [P] Mark 001/FR-033, 001/SC-006 and 001/US4 as **WITHDRAWN by 007** in `specs/001-interest-media-sharing/spec.md`, each with a pointer to this feature — RS-001, RS-004. An invalidated requirement that is merely ignored still reads as a promise
- [ ] T008a [P] Mark **001/FR-034 as WITHDRAWN as written** in `specs/001-interest-media-sharing/spec.md`, pointing at 007/FR-029 which carries its intent forward — RS-007. It named an interest boundary the ranked feed does not have, but "a follow should mean something" survives and must be stated somewhere
- [ ] T009 [P] Re-evaluate the Constitution Check in `specs/001-interest-media-sharing/plan.md` against constitution 2.0.0 and record the result — RS-005, required by the governance section for any plan written before an amendment
- [ ] T010 [P] Correct `CLAUDE.md` where it describes the feed as COMPOSED from followed interests, and record that Principle I was amended on 2026-09-08 — RS-006
- [ ] T011 Remove the FR-033 intersection from `apps/api/src/modules/feed/feed.service.ts`, and delete `apps/api/src/modules/feed/ranking.ts` and `apps/api/src/modules/feed/follow-expansion.ts`, leaving the feed reading a candidate list it is handed. **Single-owner file.** `follow-expansion.ts` is the follow-graph expansion the composed feed used and has no other caller
- [ ] T011a Delete `apps/api/tests/unit/feed-ranking.spec.ts`, which imports the module T011 removes — without this the build breaks partway through Phase 2
- [ ] T011b **KEEP** `apps/api/tests/unit/feed-does-not-read-place-follows.spec.ts` and re-point it at the rewritten `FeedService`. It guards 004/SC-006 — following a place must not feed you its posts — and that principle is untouched by this feature. It is named here because it sits in the module being rewritten and would otherwise be deleted as collateral
- [ ] T012 Update `apps/api/tests/visibility/matrix.spec.ts` so the home-feed row is a RANKED surface, keeping every assertion about what the filter decides. **Single-owner file** — Principle II's surface enumeration must not shrink

**Checkpoint**: the old guarantee is gone from code, tests, specs and the project guide; the
boundary guard exists and passes. Nothing yet ranks.

---

## Phase 3 — US1: A feed that gets better the more I use it (P1)

**Goal**: one blended stream, ordered by what the person does.

**Independent test**: seed a signal profile directly, request the feed, and assert posts from
the weighted interest appear earlier than posts from a skipped one.

### Signals — recording what happened

- [ ] T013 [US1] Implement `SignalRepository` in `apps/api/src/persistence/signal.repository.ts` for access patterns B1–B6 of `data-model.md` — profile get, atomic weight add, event put, event query by prefix, batch delete, seed get
- [ ] T014 [US1] Implement the decay function in `apps/api/src/modules/ranking/decay.ts`: `w × 0.5^(ageDays / 14)`, applied on READ from the stored timestamp. Never rewrite rows on a schedule — research R3
- [ ] T015 [US1] Implement `SignalService.record` (FR-003, FR-004) in `apps/api/src/modules/signals/signal.service.ts` applying every server-side bound from `contracts/signals.md`: clamp dwell to 30s, discard below 3s, one weight per kind per post per session, bounded batch
- [ ] T016 [US1] Implement `POST /v1/signals` in `apps/api/src/modules/signals/signal.controller.ts`, writing signals for the AUTHENTICATED CALLER ONLY and rejecting any signal for a post the caller cannot see
- [ ] T017 [US1] Write the hostile-client test at `apps/api/tests/integration/signals-hostile-client.spec.ts` covering all five cases in `contracts/signals.md` — **G5**. Constitution III: a test that only drives the app's own client does not cover a server-side guarantee

### Ranking — deciding what to show

- [ ] T018 [US1] Implement `CandidateSource` in `apps/api/src/modules/ranking/candidate-source.ts` reading the EXISTING post-interest index across the viewer's top-weighted interests — research R1, no new GSI
- [ ] T019 [US1] Implement exploration in `apps/api/src/modules/ranking/explore.ts` — ε = 0.2 of every page drawn from interests outside the weighted set. **FR-007 is correctness, not preference**: without it the profile is a feedback loop whose narrowing cannot be recovered, because the signals that would broaden it are never generated
- [ ] T020 [US1] Implement `RankingService.rank` (FR-002) in `apps/api/src/modules/ranking/ranking.service.ts` scoring candidates from the decayed profile. It MUST NOT import the visibility boundary — T004 fails the build if it does
- [ ] T021a [US1] Implement the followed-author boost in `apps/api/src/modules/ranking/ranking.service.ts` — FR-029. Bounded, and it MUST NOT admit a post the ranking would not otherwise have considered nor consume the exploration share
- [ ] T021b [P] [US1] Write `apps/api/tests/unit/followed-author-boost.spec.ts` asserting the boost reorders and never widens — the same shape as the constraint 001's ranking carried, restated for a feed with no interest boundary
- [ ] T021 [US1] Implement the fallback ordering in `apps/api/src/modules/ranking/ranking.service.ts` for when a ranking cannot be produced — FR-009, a defensible order rather than an error screen
- [ ] T022 [US1] Wire `FeedService` (FR-005) in `apps/api/src/modules/feed/feed.service.ts` to call `RankingService` and then `VisibilityFilter.decide` on its output, in that order, per request. **Single-owner file**, and the order is the contract
- [ ] T023 [US1] Implement session-scoped de-duplication and continuous paging in `apps/api/src/modules/feed/feed.service.ts` — FR-008, no repeat within a session, no visible interruption at a page boundary
- [ ] T024 [US1] Write `apps/api/tests/integration/ranked-feed.spec.ts` asserting SC-001 by COMPARING POSITIONS before and after a scripted session, not by inspecting output
- [ ] T025 [US1] Write `apps/api/tests/unit/explore.spec.ts` asserting SC-004: across 100 consecutive responses for a viewer whose signals all point at one interest, no response is entirely that interest
- [ ] T026 [US1] Write `apps/e2e/journeys/feed.spec.ts` (FR-006) — REWRITTEN against the ranked feed (RS-003), asserting SC-005: a post flipped to private is absent on the FIRST request after the flip

### Cold start — what a new account sees

- [ ] T027 [US1] Implement seed-interest storage (FR-014) in `apps/api/src/modules/signals/seed.service.ts` writing `SEEDINTERESTS` as its OWN item type — **not interest follows**. Storing them as follows would recreate the subscription feed through the back door, because every later reader treats a follow as a follow (research R4)
- [ ] T028 [US1] Implement the fallback for a skipped cold start in `apps/api/src/modules/ranking/candidate-source.ts` — FR-015, a populated feed with no picks at all
- [ ] T029 [P] [US1] Build the cold-start screen in `apps/mobile/src/features/onboarding/PickInterestsScreen.tsx` per `design/007-ui/ColdStart.dc.html`, worded as a starting point rather than a subscription

### The client's side of the signals

- [ ] T030 [US1] Implement dwell measurement in `apps/mobile/src/features/feed/useDwell.ts` — viewability at 60% / 300ms, clock stopped by `AppState`, per-post cap, batched flush every 30s and on background (research R7, FR-004)
- [ ] T031 [US1] Add `signals.record` to `apps/mobile/src/data/signals.ts` and wire it through `apps/e2e/support/client.ts`. **Single-owner file**
- [ ] T032 [US1] Write `apps/e2e/journeys/signals.spec.ts` driving a session through the app's own data layer and asserting the profile moved

**Checkpoint**: the feed ranks, cannot collapse, cannot over-admit, and a visibility flip
still lands immediately.

---

## Phase 4 — US2: I can see what my feed is built from, and reset it (P1)

**Goal**: the control Principle I requires. **This ships with US1 or US1 does not ship.**

**Independent test**: read the disclosure, clear the signals, assert the store is empty and
the feed returns to seed state.

- [ ] T033 [US2] Implement `GET /v1/me/feed-signals` (FR-011) in `apps/api/src/modules/signals/signal.controller.ts`, rendering the explanation from THE SAME WEIGHTS the ranker reads so it cannot drift from the behaviour it describes
- [ ] T034 [US2] Implement `DELETE /v1/me/feed-signals` deleting the profile AND the raw events (B5), so clearing is verifiable rather than cosmetic — FR-012
- [ ] T035 [US2] Write `apps/api/tests/integration/signal-reset.spec.ts` asserting the STORE is empty after a reset and that the next feed ranks as it would for a new account with the same seeds — **G3**
- [ ] T036 [P] [US2] Add the "Your feed" group to `apps/mobile/src/features/profile/SettingsScreen.tsx` per `design/007-ui/Settings.dc.html` — what it is built from, and a clear control
- [ ] T037 [US2] Extend `apps/api/tests/visibility/matrix.spec.ts` (FR-013) with a row asserting one person's signals are absent from every enumerated surface — **G5**, SC-007. **Single-owner file**
- [ ] T038 [P] [US2] Write `apps/e2e/browser/settings-reset.spec.ts` asserting a person can find the disclosure and clear it from the app's main screen — SC-003

**Checkpoint**: G3 and G5 discharged. The ranking is inspectable and resettable, which is what
makes the amendment a replacement rather than a deletion.

---

## Phase 5 — US3: The app I open forty times a day (P2)

**Goal**: twenty screens in the approved design. `design/007-ui/` is settled; this phase
implements it and does not reopen it.

### The system

- [ ] T039 [US3] Rebuild `apps/mobile/src/ui/tokens.ts` from `design/007-ui/_tokens.md` — page `#FBFAF8`, card `#FFFFFF`, accent `#1F6B3F`, the five type roles, radii. **Single-owner file**
- [ ] T040 [US3] Remove every shadow and elevation value from `apps/mobile/src/ui/` — FR-023, depth is surface, spacing and radius
- [ ] T041 [P] [US3] Switch the app to Plus Jakarta Sans in `apps/mobile/app.config.ts` and `apps/mobile/src/ui/tokens.ts`, with a fallback stack — FR-022
- [ ] T042 [P] [US3] Write `apps/mobile/src/__tests__/one-accent.test.ts` failing the build if any colour outside the token file is used as an accent — FR-022, mechanically rather than by eye
- [ ] T043 [P] [US3] Write `apps/mobile/src/__tests__/no-shadow.test.ts` failing on any `shadow*` or `elevation` property in `src/` — FR-023

### The waterfall

- [ ] T044 [US3] Implement `apps/mobile/src/components/Waterfall.tsx` (FR-021) — block-wise, 8 posts per block, each card to the shorter column by accumulated height, blocks virtualised by one `FlatList` (research R6)
- [ ] T045 [US3] Write `apps/mobile/src/__tests__/waterfall.test.tsx` asserting columns stagger within a block and that no `VirtualizedList` is nested inside a `ScrollView`
- [ ] T046 [US3] Rebuild `apps/mobile/src/components/PostCard.tsx` as the waterfall card — media at its own aspect ratio, title, author, count, and the interest as a COLOURED WORD (FR-024), keeping every existing testID
- [ ] T047 [P] [US3] Write `apps/mobile/src/__tests__/interest-is-a-word.test.ts` failing if an interest is rendered as a chip, badge, pill or stamp anywhere — FR-024, the one signature, enforced

### The screens

- [ ] T048 [US3] Rebuild the feed in `apps/mobile/src/features/feed/HomeFeedScreen.tsx` per `design/007-ui/Main.dc.html` — no sections, no ranking explanation (FR-001, FR-010)
- [ ] T049 [P] [US3] Rebuild `apps/mobile/src/features/posts/PostDetailScreen.tsx` and `apps/mobile/src/features/engagement/CommentsScreen.tsx` per `Post.dc.html` and `Comments.dc.html`
- [ ] T050 [P] [US3] Rebuild `apps/mobile/src/features/auth/SignInScreen.tsx` per `SignIn.dc.html`
- [ ] T051 [P] [US3] Rebuild `apps/mobile/src/features/profile/ProfileScreen.tsx`, `EditProfileScreen.tsx` and `apps/mobile/src/features/posts/SavedScreen.tsx` per `Profile.dc.html`, `PersonProfile.dc.html`, `EditProfile.dc.html`, `Saved.dc.html`
- [ ] T052 [P] [US3] Rebuild `apps/mobile/src/features/conversations/` — `InboxScreen.tsx`, `ConversationScreen.tsx`, `NewGroupScreen.tsx` per `Chats.dc.html`, `Conversation.dc.html`, `NewGroup.dc.html`
- [ ] T053 [P] [US3] Rebuild `apps/mobile/src/features/notifications/NotificationsScreen.tsx` per `Activity.dc.html`
- [ ] T054 [P] [US3] Rebuild `apps/mobile/src/features/publish/ComposeScreen.tsx` and `MediaPickerScreen.tsx` per `Compose.dc.html` and `MediaPicker.dc.html`
- [ ] T055 [US3] Update `apps/mobile/src/screens/index.tsx` and `App.tsx` for the new tab bar and navigation. **Single-owner file**
- [ ] T056 [US3] Run `pnpm --filter @sih/mobile test -- testid-snapshot` and resolve any difference by fixing the SCREEN, never the snapshot — FR-027, SC-011
- [ ] T057 [P] [US3] Extend `apps/mobile/src/__tests__/touch-target.test.tsx` (FR-025) to all twenty screens — SC-009
- [ ] T057a [P] [US3] Keep `apps/mobile/src/__tests__/text-has-colour.test.ts`'s font-scaling guard passing through the rebuild — FR-026. 006 established exactly one `allowFontScaling={false}`, on `Avatar`'s initial, and Phase 5 rebuilds that component. Turning scaling off is the easiest fix for any text that overflows, which is why the guard exists rather than a comment
- [ ] T058 [P] [US3] Extend `apps/e2e/browser/safety-fit.spec.ts` to measure every screen at the largest platform font on a 640pt viewport — SC-010, the case that reached production once

**Checkpoint**: every screen is the approved design, every testID still resolves, and nothing
is unreachable at the largest font.

---

## Phase 6 — US4: Interests are still how I find things (P2)

**Goal**: G2. Without this the ranked feed leaves the taxonomy vestigial, which is the exact
failure Principle I names.

- [ ] T059 [P] [US4] Rebuild `apps/mobile/src/features/discover/InterestScreen.tsx` per `Interest.dc.html`, keeping the sub-interest roll-up and stating it — FR-018
- [ ] T060 [P] [US4] Rebuild `apps/mobile/src/features/discover/InterestSearchScreen.tsx` per `Explore.dc.html` with interests, places and people as DISTINGUISHABLE KINDS — FR-019
- [ ] T061 [US4] Make the interest navigate to its space from every post, in `apps/mobile/src/components/PostCard.tsx`, `apps/mobile/src/features/posts/PostDetailScreen.tsx` and `apps/mobile/src/screens/index.tsx` — FR-017
- [ ] T062 [P] [US4] Rebuild `apps/mobile/src/features/places/PlaceScreen.tsx` per `Place.dc.html`, WITHOUT the interest colour treatment — FR-020, because following a place does not feed you its posts
- [ ] T063 [P] [US4] Write `apps/mobile/src/__tests__/interest-treatment.test.ts` failing if a place or a person carries the interest treatment — FR-020, carried over from 006 where it already earned its place
- [ ] T064 [US4] Write `apps/e2e/browser/interest-reachable.spec.ts` asserting the interest space is one tap from a feed card and lists rolled-up posts — **G2**

---

## Phase 7 — US5: Publishing, and being able to report it (P2)

- [ ] T065 [US5] Make the interest REQUIRED in `apps/api/src/modules/posts/post.controller.ts` — publishing without one fails and names what is missing (FR-016, **G1**)
- [ ] T066 [US5] Enforce the same in `apps/mobile/src/features/publish/ComposeScreen.tsx`: the share control is unavailable until an interest is chosen
- [ ] T067 [P] [US5] Write `apps/api/tests/integration/interest-required.spec.ts` asserting publish is refused server-side, through the path a modified client would take — **G1**
- [ ] T068 [US5] Rebuild `apps/mobile/src/features/safety/SafetyActions.tsx` per `Safety.dc.html` as a SCROLLING sheet — the block control was unreachable in production once
- [ ] T069 [P] [US5] Keep `apps/mobile/src/__tests__/screen-scrolls.test.ts` passing against the rebuilt sheet — **G6**
- [ ] T070 [US5] Verify report and block (FR-028) still reach the server unchanged by running `pnpm --filter @sih/e2e test -- safety`

---

## Phase 8: Evidence and cross-cutting

- [ ] T070a Extend `apps/api/bench/feed.bench.ts` to the ranked path and record **p95 first-screen latency and the ranking's own added time** — **SC-012**, and the constitution's "a stated numeric criterion MUST have a task that measures it". The harness already exists; nothing new is needed but the run
- [ ] T070b [P] Extend `apps/e2e/browser/safety-fit.spec.ts` to assert **four or more posts are visible on the feed at a 640pt viewport without scrolling** — SC-008, measured at a fixed viewport rather than counted by eye
- [ ] T070c [P] Assert in `apps/e2e/journeys/onboarding.spec.ts` that a new account reaches a **populated** feed, with no empty state on the path — SC-002
- [ ] T071 Run the FULL CI step list from `.github/workflows/ci.yml`, in order, not a proxy for it. Run `@sih/e2e` **alone** — two concurrent jest invocations kill each other's API and produce a page of `fetch failed` that reads like a product failure
- [ ] T072 [P] Run `node scripts/verify-maestro-ids.mjs` and fix any selector the redesign broke, in the app rather than in the flow
- [ ] T073 Update the Maestro flows in `.maestro/` for the ranked feed — `06-home-feed.yaml` can no longer assert an interest section
- [ ] T074 Recapture the screens with `apps/e2e/scripts/capture-screens.ts` (run from `apps/e2e`) and keep the before/after pair in `docs/screens/README.md`
- [ ] T075 Dispatch `.github/workflows/android-emulator.yml` and record the result. **The feature is not complete without it** — Constitution V, and this project has three defects on record that only a device run found
- [ ] T076 [P] Write the run record in `docs/verification/runs/`, naming each criterion, the command that measured it, and **each criterion NOT met**
- [ ] T077 [P] Update `CLAUDE.md` with what 007 established and what it did not
- [ ] T078 Re-check `spec.md`, `plan.md`, `research.md` and `contracts/` against what was actually built — the artifacts have drifted before and it was the owner who noticed, not me

---

## Dependencies

```
Phase 1 Setup
      ↓
Phase 2 Foundational — withdrawals + boundary guard   ← BLOCKS EVERYTHING
      ↓
Phase 3 US1 ranked feed (P1)  ──→  Phase 4 US2 control (P1)
      ↓
Phase 5 US3 redesign (P2)  ──→  Phase 6 US4 interests (P2)
      ↓                              ↓
      └──────────→ Phase 7 US5 publish + safety (P2)
                          ↓
                   Phase 8 Evidence
```

- **US2 depends on US1** — there is nothing to disclose or reset until signals exist.
- **US4 depends on US3** — the interest screens are rebuilt in the same design system.
- **US1 and US3 are independent.** The ranked feed can ship on the existing screens.

## Parallel opportunities

- **Phase 2**: T008, T009, T010 are three different documents — genuinely parallel.
- **Phase 3**: signals (T013–T017) and ranking (T018–T021) are separate modules; only T022
  needs both.
- **Phase 5**: T049–T054 are six disjoint feature directories. This is the widest parallel
  band in the feature.
- **Phase 5 guards**: T042, T043, T047, T057, T058 are all separate test files.

Everything touching `apps/mobile/src/screens/index.tsx` (T055, T061) is sequential.

## Implementation strategy

**MVP is Phase 2 + Phase 3 + Phase 4.** That is a ranked feed a person can see into and
reset, on the existing screens. It is shippable and it satisfies every gate the amendment
introduced.

**Phase 5 onward is what makes it an app somebody chooses to use.** Valuable, and not what
makes the constitution's new obligations true.

**Phase 8 is not optional.** A green local suite is not evidence about a device (Principle V),
and this project has three separate defects on record that only a device run found.
