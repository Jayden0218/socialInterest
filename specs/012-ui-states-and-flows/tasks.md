---

description: "Task list for 012 — The App Says What It Is Doing"
---

# Tasks: The App Says What It Is Doing

**Input**: Design documents from `specs/012-ui-states-and-flows/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[`design/012-ui/`](../../design/012-ui/) — 24 artboards, the approved design

**Tests**: **Included where they can say something true.** This feature is about what a
person SEES, and the tiers differ in what they can see: RNTL performs no layout, so it can
say a component mounted and not that it occupies space; a browser render can measure layout
and visibility; only a device can speak to fonts, keyboards and native behaviour. Each task
below asserts at the tier that supports its claim, and the device tier is **not available**.

**Organization**: by user story, so each is independently shippable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: which user story this serves

## The surfaces, under the three names each of them has

The spec and the artboards use the product's names. **The code uses different ones**, and
004 records what that costs: notification preferences were reported unimplemented in the
spec, the plan, the task list and CLAUDE.md because the grep was `notificationPreferences`
and the code says `notificationPrefs`. R1 of this very feature made the same class of error
— grepping `screens/*Container.tsx` for empty states that live in `features/*/…Screen.tsx`.

| Spec / artboard | Container | Screen |
|---|---|---|
| Feed | `HomeFeedContainer` | `features/feed/…` |
| Explore | **`DiscoverContainer`** | `features/discover/…` |
| Activity | **`NotificationsContainer`** | `features/notifications/…` |
| Chats | **`InboxContainer`** | `features/conversations/InboxScreen` |
| Profile | `ProfileContainer` | `features/profile/ProfileScreen` |

---

## The sequencing decision that is not a preference

**Phase 2 (the icon set) comes before every other visible change.** The states, the card and
Explore all use icons; building them first means designing against a visual language that is
about to change, then doing it again. That is why the spec demoted its own states-styling
story to P3 after the research.

---

## Phase 1: Setup — make looking repeatable

- [ ] T001 Confirm `apps/e2e/scripts/capture-screens.ts` runs end to end against a seeded API and writes to `docs/screens/`. **It already sets `EXPO_PUBLIC_API_BASE_URL: '/v1'`** — the same-origin fix a second, ad-hoc capture script had to rediscover the hard way. Do not write another one
- [ ] T002 [P] Add the 24 artboards' token values to a short reference at `design/012-ui/README.md` — which artboard governs which screen — so an implementer does not have to open the canvas to know what they are building against

**Checkpoint**: the screens can be rendered and looked at on demand.

---

## Phase 2: Foundational — the icon set (BLOCKING)

**⚠️ No other visible work begins until T003–T008 are done.**

- [ ] T003 **Install `react-native-svg` FIRST, and with `expo install`.** It is **NOT** present: zero occurrences in `pnpm-lock.yaml` and no directory under any `node_modules`, though the plan said otherwise until this analysis. It IS a known Expo native module — `node_modules/expo/bundledNativeModules.json` pins **15.12.1**, which is authoritative and must be read directly because `expo install` cannot reach its API from this sandbox. Run `pnpm --filter @sih/mobile exec expo install react-native-svg`. **Never `pnpm add`**: that is defect #1 of the seven only a device found — it took `expo-image-picker@57` against SDK 54's `expo-modules-core@3` and killed the app during module registration with `NoClassDefFoundError`. If the install genuinely cannot be made to work, stop and report rather than reaching for an icon font — the artboards define an exact stroke and a borrowed family will not match it
- [ ] T004 Create `apps/mobile/src/ui/icons.ts` holding the 16 paths from `design/012-ui/_icons.txt` verbatim — home, explore, plus, chats, activity, profile, heart, comment, share, save, back, search, more, close, camera, check
- [ ] T005 Create `apps/mobile/src/ui/Icon.tsx`: one component over `react-native-svg`, `stroke-width` 1.75, round caps and joins, `currentColor` semantics via a `color` prop, and **three sizes only** — 13 for counts, 20 for actions, 23 for navigation. A free-form size is how a set stops being a set
- [ ] T006 Write `apps/mobile/src/__tests__/every-action-has-an-icon.test.ts`: no source file outside `ui/Icon.tsx` may draw an icon, and **no typographic character may stand in for one** (SC-009, FR-027). Assert the PROPERTY — no non-ASCII presentational character in a rendered string, against a short allow-list — **not** a hand-picked list of offenders like `♥ ★ ☆ → ← ✓ ✕ ×`. A hand-picked list only covers the mistakes already made: it is why 004's first auth-surface guard missed the second occurrence of the defect it was written for, and why 011's constant-time guard passed a deliberate break past three hand-guessed spellings
- [ ] T007 **Run T006 against the product as it stands and watch it FAIL.** It must name `PostCard.tsx`'s `♥ {post.reactionCount}` and `App.tsx`'s 8×8 dot. A guard that has only ever passed is not a guard, and this feature's whole premise is that those two exist
- [ ] T008 [P] Register the new icon controls in `touch-target.test.tsx`'s `SLOP_TARGETS` where they use `hitSlop` — **per control, not per file**, per the weakness 011 found in that guard's other branch

**Checkpoint**: an icon can be drawn, exactly once, in one way.

---

## Phase 3: User Story 4 — the app looks like an app (Priority: P1) 🎯

**Goal**: nothing in the product is drawn as a dot or a typographic character.

**Independent Test**: put the tab bar beside any mainstream social app and ask somebody which is finished.

- [ ] T009 [US4] Replace the tab bar's 8×8 `View` in `apps/mobile/src/App.tsx` with `Icon` at 23, label beneath, per the artboards (FR-028)
- [ ] T010 [US4] Replace `♥ {post.reactionCount} · {post.commentCount}` in `components/PostCard.tsx` with heart and comment icons at 13 (FR-027)
- [ ] T011 [P] [US4] Give every action across the feature screens its icon at 20 — react, comment, share, save, back, search, more, close, camera (FR-027, FR-029)
- [ ] T012 [US4] Run T006 and watch it pass; then reintroduce a `♥` in one file and watch it fail again
- [ ] T013 [US4] Rebuild `PostCard` image-dominant per `CardAnatomy.dc.html`: **the avatar and handle come off the tile**, title first at the `label` role, then the interest word and the two counts. Target the artboard's ratio — roughly 78% photograph against today's 47% (FR-030)
- [ ] T014 [US4] Assert the ratio in `apps/e2e/browser/` — measured, not eyeballed. **RNTL cannot make this claim**: it performs no layout, which is how 008 shipped `MediaPager` at zero height with nine green assertions
- [ ] T015 [US4] Capture the feed and compare against `Main.dc.html`. Record drift as either a fix or a state the artboard does not cover (FR-026)

**Checkpoint**: the product stops looking like a prototype.

---

## Phase 4: User Story 1 — the app says what it is doing (Priority: P1)

**Goal**: no surface is ever an unexplained blank screen.

- [ ] T016 [US1] Create `apps/mobile/src/ui/states.tsx` — `Skeleton`, `EmptyState`, `FailedState` — built from the existing tokens per `States.dc.html`, introducing no new ones (FR-025)
- [ ] T017 [US1] Derive the four states **once**, in the data hook (`usePaged`), and hand them down. Twenty-five screens each deciding what "empty" means is twenty-five chances to render blank, and the five that exist today already disagree (FR-001)
- [ ] T017a [US1] **Move `InboxContainer` onto `usePaged` before T018 touches it**, or record in the plan why it cannot. T017 derives the states in `apps/mobile/src/containers/usePaged.ts`, and six hooks in `containers/index.ts` wrap it — `useHomeFeed`, `useFollowingFeed`, `useInterestSearch`, `usePostSearch`, `useNotifications`, `useProfilePosts` — which reaches Feed, Explore, Activity and Profile. **Chats does not**: `InboxContainer` hand-rolls `useState`/`useEffect` and its `load` sets no loading flag at all, so T018 would otherwise hand-write a twenty-sixth state machine on the one surface this feature is supposed to fix. Its two real constraints — two inboxes each its own request, and a separate badge read — are why this is a task and not a footnote (numbered `a` rather than renumbering thirty-five tasks, the same way the spec carries FR-006a)
- [ ] T018 [US1] Apply the states to Feed, Explore, Activity, Chats and Profile. A skeleton is **shaped like the content it replaces**, never a centred spinner (FR-003, FR-004). **The spec's names are not the code's**, and this project has already paid for that confusion — see the mapping below
- [ ] T019 [US1] Add the delay threshold: no loading indicator for a request that resolves under ~200ms (FR-005). A skeleton that flashes for 40ms reads as a glitch, not as progress
- [ ] T020 [US1] Add the upper bound: a request pending past ~15s is reported **failed**, not shown loading forever (FR-006). Without it a dropped connection shows a skeleton for ever, which is a blank screen wearing a costume
- [ ] T021 [US1] Every empty state names an action and offers the control that performs it (FR-007), and offers nothing that person cannot do (FR-008)
- [ ] T022 [US1] Every failure is visibly distinct from empty and offers a retry that re-attempts the request (FR-009, FR-010)
- [ ] T023 [US1] **An empty list caused by the visibility boundary says nothing about why** (FR-011). The considerate message is the wrong one: Constitution II makes absence and refusal indistinguishable on purpose, and a helpful empty state here is an oracle
- [ ] T024 [US1] Write `apps/mobile/src/__tests__/four-states.test.ts`: every surface that fetches renders something in each of the four states — **and watch it red first**, against the four primary surfaces that have no loading state today
- [ ] T025 [US1] Assert in the browser that the three states are visually distinguishable from one another (SC-008). A person who has not been told which is which must be able to tell

**Checkpoint**: the app stops looking broken while it works.

---

## Phase 5: User Story 1 continued — refreshing (Priority: P1)

- [ ] T026 [US1] Add `RefreshControl` to every list a person would expect to refresh — **there are currently zero occurrences in the app** (FR-012)
- [ ] T027 [US1] A refresh in progress is visible and **visibly concludes even when nothing changed** (FR-013), or the gesture reads as broken
- [ ] T028 [US1] A refresh requested while one is running does not start a second (FR-014)

---

## Phase 6: User Story 1 continued — a photograph is a surface too (Priority: P1)

- [ ] T029 [US1] Create `apps/mobile/src/ui/Photo.tsx` — an image carrying its own loading, failed and absent states (FR-006a). Research R3: every image in the captures is the same grey box in all three cases, on a product whose premise is photographs
- [ ] T030 [US1] Replace every direct `Image` on a content surface with `Photo`
- [ ] T031 [US1] **Determine on the owner's own install whether images load at all.** They render as grey boxes in this sandbox because object storage is unreachable here, and that is an artefact — if they are grey on a real device too, that is 006/R4b's media defect in a third place and a larger problem than this feature

---

## Phase 7: User Story 2 — every journey finishes (Priority: P1)

- [ ] T032 [US2] Give `people-search` a renderer **and** a way in. It has neither today — a route nothing can reach that also could not draw itself if reached (FR-015, FR-016)
- [ ] T033 [US2] Give `create-place` a caller, or remove the route. A route with no way in is not a screen
- [ ] T034 [US2] Build the post actions sheet and the safety sheet per `PostActions.dc.html` and `SafetySheet.dc.html`. Report and block currently sit behind an unlabelled `⋯`; Constitution IV makes those easier to reach, never harder
- [ ] T035 [US2] Walk every journey end to end **as a person, not as a test**, and write down the first point at which you cannot continue. That list is the rest of this phase (FR-017)
- [ ] T036 [US2] Every pushed screen offers a way back that does not depend on a platform gesture (FR-018)
- [ ] T037 [US2] Write a guard that fails the build if a declared route has no renderer or no caller. `people-search` is why: two halves missing and nothing noticed

---

## Phase 8: User Story 5 — the app suggests instead of waiting (Priority: P2)

- [ ] T038 [US5] Rebuild Explore per `Explore.dc.html`: **one** search field instead of two, and interest tiles with a photo mosaic and a post count shown **before anything is typed** (FR-031, FR-032)
- [ ] T039 [US5] Build the interest space per `InterestSpace.dc.html`. It is the product's premise — every space is browsed by one interest — and it had no artboard at all until this pass
- [ ] T040 [US5] Every primary surface offers a visible next action without scrolling (FR-033)
- [ ] T041 [US5] Build the cold start per `ColdStart.dc.html`, so a new account's first screen after sign-up leads somewhere rather than to an empty feed

---

## Phase 9: User Story 3 — a new account is not an empty room (Priority: P2)

- [ ] T042 [US3] A newly created account is never shown an unexplained empty feed (FR-019)
- [ ] T043 [US3] Where it is empty, say why and offer a next action available to that person (FR-020), and taking it visibly changes the feed (FR-021)
- [ ] T044 [US3] **Decide explicitly what a real new account gets**, and record the decision. `seed:demo` is a development tool and borrowing it would be answering a product question with a script. Research R4: every post in the captures shows `♥ 0 · 0`, and a feed of entirely unengaged posts reads as abandoned however well it is laid out

---

## Phase 10: Polish & close-out

- [ ] T045 [P] Confirm the visibility matrix reports the **same surfaces and the same total** (FR-022, SC-006). **If a number moved, stop and find out why** — never update the number
- [ ] T046 [P] Confirm the public and operator route snapshots are **unchanged** (FR-023, SC-007). This feature adds feedback and closes paths; it changes no permission
- [ ] T047 [P] Confirm no state introduced here displays content the boundary would have withheld (FR-024)
- [ ] T048 [P] Update the testID snapshot in the **same commit** as the flows it requires, and regenerate it when ids are ADDED rather than only when one is removed — 011 found it nineteen ids stale, and a snapshot can only detect the removal of an id it knows about
- [ ] T049 [P] Run `node scripts/verify-maestro-ids.mjs` — a selector that matches nothing fails as a thirty-second timeout twenty minutes into a device run
- [ ] T050 Run the real CI step list before pushing, not a proxy for it
- [ ] T051 Capture every screen and compare against its artboard; record each difference as drift fixed or as a state the design does not cover (FR-026)
- [ ] T052 Record the run in `docs/verification/runs/`, every criterion pass, fail or **not run** — never blank — and **count the items** rather than reading the highest number
- [ ] T053 Record in that same run record which of the 24 artboards this feature implemented and which it did not, **by name**, against the list below. An artboard drawn and unclaimed is how "the redesign is finished" gets written over unchecked boxes — 007 reported eight phases complete with four Phase 5 boxes unticked, and `tasks.md` was right while the prose was not

---

## Success criteria → the task that measures each

| Criterion | Measured by |
|---|---|
| SC-001 no unexplained blank screen | T024, T025 |
| SC-002 every primary surface refreshes | T026, T027 |
| SC-003 zero unreachable routes | T032, T033, T037 |
| SC-004 every journey completes | T035 — **needs a person**, and is reported not run until one walks it |
| SC-005 a new account never sees a blank feed | T042, T043 |
| SC-006 matrix unchanged | T045 |
| SC-007 snapshots unchanged | T046 |
| SC-008 the three states are distinguishable | T025 |
| SC-009 zero typographic characters as icons | T006, T012 |
| SC-010 a stranger reaches content without typing | T038 — **needs a person** |
| SC-011 the nav does not read as unfinished | T009, T015 — **needs a person**; a capture is evidence about layout, not about judgement |

## User Story 6, and the fourteen artboards this feature does not implement

Two pieces of bookkeeping that `/speckit-analyze` found missing. Both are honest scoping
rather than hidden work, and both are written down because the alternative is discovering
them at close-out.

**US6 has no phase of its own, deliberately.** "The states look like the rest of the
product" is P3 and is delivered *inside* other tasks rather than after them: **T016** builds
`states.tsx` from the existing tokens per `States.dc.html` (FR-025), and **T015** and
**T051** record drift against the artboards (FR-026). Giving it a phase would mean styling
the states twice — once against 007's language and again against 012's — which is the exact
work-twice ordering the spec demoted the story to avoid. It carries no `[US6]` label for
that reason, and this paragraph is the record that the omission was a decision.

**Fourteen of the 24 artboards are drawn and NOT implemented here**: `Activity`, `Auth`,
`Chats`, `Compose`, `Conversation`, `EditProfile`, `MediaPicker`, `NewMessage`,
`OwnProfile`, `Place`, `PostDetail`, `Profile`, `Saved`, `Search`. The ten this feature does
implement are `Main`, `CardAnatomy`, `States`, `Explore`, `InterestSpace`, `ColdStart`,
`PostActions`, `SafetySheet`, plus `Icons` and `FlowMap` as reference rather than as screens.

That is the right scope and not an oversight: **the MVP is Phases 1–3**, the plan says to
ship that and look at it on a phone before ordering the rest, and the fourteen are screens
that already work and are not what the owner was complaining about. What would be wrong is
leaving it unsaid. T053 makes the split part of the run record.

## Dependencies

```text
Phase 1 (looking is repeatable)
   └─> Phase 2 (the icon set) ── BLOCKS EVERY VISIBLE CHANGE
          ├─> Phase 3 (US4 — icons applied, the card rebuilt)   ── ships alone
          ├─> Phase 4-6 (US1 — the four states, refresh, photos) ── ships alone
          ├─> Phase 7 (US2 — reachability)                       ── ships alone
          ├─> Phase 8 (US5 — Explore, interest space, cold start)
          │      └─> Phase 9 (US3 — the new account)
          └─> Phase 10 (close-out)
```

Phase 9 follows Phase 8 because the cold start is where a new account's first action lives.

## Parallel opportunities

- T002 with T001
- T008 with T004–T007
- T011 with T009–T010 (different files)
- Every task in Phase 10 except T050, T051 and T052

## Implementation strategy

**Phases 1–3 are the MVP**, and that is a deliberate reversal of the spec's first ordering.
The icon set plus the rebuilt card is the change a person notices, it is objective rather
than a matter of taste, and it is a day's work against the rest of this list.

Ship that, look at it on the phone, and only then decide whether the remaining phases are in
the right order — the last time this feature's priorities were set without looking, they were
wrong.
