---

description: "Task list for feature 005: place reviews and group conversations"
---

# Tasks: place reviews and group conversations

**Input**: Design documents from `/specs/005-reviews-and-group-chat/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: **Included, and not optional here.** The constitution requires that a document
declaring itself a contract has its test written before the implementations it governs, and
that "a stated numeric criterion MUST have a task that measures it. A criterion with an
implementation but no measurement is not met, it is merely attempted." Every SC-0xx below
has a measuring task, named.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1, US2, US3
- Exact file paths in every task

## Path conventions

pnpm monorepo: `apps/api`, `apps/mobile`, `apps/workers`, `apps/e2e`, `packages/shared`,
`.maestro`. Paths below are repository-relative.

## The four gates, restated

From plan.md. Each blocks work that would otherwise look ready:

| Gate | Blocks | Enforced by |
|---|---|---|
| **G1** | any group feature, until conversation identity + state migration land and SC-008 passes against rows the *old* code wrote | **T066–T075** precede every other US3 task |
| **G2** | US2 shipping without review reporting and moderation (Principle IV) | **T055–T058** are inside US2, not Polish |
| **G3** | the review read path, until the feed guard is extended | **T012** precedes **T050** |
| **G4** | the review read path, until the matrix addendum test exists | **T040–T043** precede **T050** |

---

## Phase 1: Setup

**Purpose**: nothing to install. This feature adds no dependency; these tasks make the new
shapes available to every later one.

- [X] T001 [P] Add `Review`, `PlaceRatingSummary`, `RatingWrite` and `ConversationParticipant` types to `packages/shared/src/index.ts`, matching `contracts/openapi-delta.yaml` exactly
- [X] T002 [P] Extend `Conversation` in `packages/shared/src/index.ts` with `kind`, `name` and `participants`, leaving every existing field's meaning unchanged (FR-026)
- [X] T003 Merge `contracts/openapi-delta.yaml` into `apps/api/contracts/openapi.yaml` — one document, because the client is generated from it and two documents generate two clients (002's first defect)
- [X] T004 Run `pnpm --filter @sih/shared generate:client` and confirm `git diff --exit-code packages/shared/src/client/operations.generated.ts` is clean — **there is no `verify:client-drift` script**; the drift check in `.github/workflows/ci.yml` is regenerate-then-diff, and naming a command that does not exist is how a task gets reported done without running

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: keys, the shared visibility refactor, and the guards that must exist before the
code they guard.

**⚠️ No user story work begins until this phase completes.**

### Keys and persistence primitives

- [X] T005 Add `rating`, `ratingByPerson`, `ratingPrefix`, `conversationMember` and `conversationMemberPrefix` key builders to `apps/api/src/persistence/keys.ts` per data-model.md § Key builders
- [X] T006 Add `rating: 'RATING#'` and `conversationMember: 'PARTICIPANT#'` to `SK_PREFIX` in `apps/api/src/persistence/keys.ts`
- [X] T007 Add `rating` to `ITEM_TYPE_005` in `apps/api/src/persistence/keys.ts`
- [X] T008 [P] Unit-test the key builders in `apps/api/tests/unit/keys-005.spec.ts`, asserting the exact strings from data-model.md — a key mismatch is silent, a query simply returns nothing

### The shared visibility boundary (research R4)

- [X] T009 Extract the both-directions block check from `VisibilityFilter.decide` into a single exported function in `apps/api/src/visibility/visibility.filter.ts`, changing no behaviour
- [X] T010 Run `pnpm --filter @sih/api test tests/visibility/matrix.spec.ts` and confirm the existing 462 assertions pass unchanged after T009 — a refactor of the boundary that alters a decision is the defect this feature must not introduce
- [X] T011 Create `apps/api/src/visibility/authored-content.ts` with a `decideAuthored()` entry point that calls the function from T009 and **does not import `BlockRepository`**, per contracts/visibility-matrix-addendum.md § 4.2

### Guards, before the code they guard

- [X] T012 **[G3]** Extend `apps/api/tests/unit/feed-does-not-read-place-follows.spec.ts` so it also fails if `FeedService` imports `RatingRepository`, mentions reviews, or changes arity — Principle I, and it must fail on the dependency appearing rather than on a behaviour
- [X] T013 [P] Add a unit test in `apps/api/tests/unit/authored-content-shares-blocks.spec.ts` asserting `authored-content.ts` does not import `BlockRepository` — two entry points each reading blocks are the two predicates Principle II forbids
- [X] T014 **Re-scoped, and the reason is a real dependency I had missed.** The enum entries were to land here; they cannot. `subjectExists` in `apps/api/src/modules/safety/report.service.ts` is an exhaustive switch with no `default`, so adding a member is a compile error until its branch exists — and the `review` branch needs `RatingRepository`, which is T021 in US1. Adding the entry alone would either break the build or force a branch returning `false`, which silently rejects every review report. **The enum entry and its branch are one change**: `review` moves into T055 (US2), `conversation-name` into T091 (US3)
- [X] T015 **Re-scoped for the same reason as T014, and the pattern is worth stating.** `auth-surface.spec.ts` compares the public set to the snapshot **in both directions**, so an entry added before its route exists fails as surely as a missing one. The rule that falls out: **a guard asserting ABSENCE can precede the code it guards; a guard asserting PRESENCE cannot.** T012 and T013 assert absence and belong here; this asserts presence and moves to the route — `GET /places/:placeId/reviews` is 005's only new public route, so its snapshot entry lands in T051 (US2). The authenticated routes need no snapshot entry, which is exactly what makes a wrongly-public one fail here
- [X] T016 Add the twelfth surface row `{ name: 'place reviews', built: false, story: '005/US2' }` to `apps/api/tests/visibility/surfaces.ts` — **`built: false` deliberately**, so the 004/T128 ratchet reports a real gap while the work is in progress instead of a smaller green number

**Checkpoint**: keys exist, the boundary has one block check with two callers, and three guards fail for the right reasons.

---

## Phase 3: User Story 1 — Rate a place (Priority: P1) 🎯 MVP

**Goal**: a person rates a place from its page; everyone sees the average and the count.

**Independent Test**: rate a place as one person, read the average and count back as a
second. Requires nothing from US2 or US3.

### Tests for US1 (write first, watch fail)

- [X] T017 [P] [US1] Unit-test the aggregate arithmetic in `apps/api/tests/unit/rating-aggregate.spec.ts` for all four operations in data-model.md's table: first, replace, withdraw, moderator removal
- [X] T018 [P] [US1] Integration test in `apps/api/tests/integration/rating-replace.spec.ts` asserting a second rating from the same person replaces rather than adds — **SC-003**
- [X] T019 [P] [US1] Integration test in `apps/api/tests/integration/rating-transaction.spec.ts` proving a replace is atomic: the sum and count never disagree with the rating rows
- [X] T020 [P] [US1] Integration test in `apps/api/tests/integration/rating-empty-place.spec.ts` asserting an unrated place reports `average: null`, not `0` — **FR-005**, and `null` is the contract

### Implementation for US1

- [X] T021 [US1] Create `RatingRepository` in `apps/api/src/persistence/rating.repository.ts` with `put`, `findByPerson`, `listByPlace` and `delete`, writing both the `PLACE#`/`RATING#` and `USER#`/`RATED#` rows
- [X] T022 [US1] Implement the transactional aggregate update in `apps/api/src/persistence/rating.repository.ts` — rating row plus place counters in one `TransactWriteItems`, per research R5
- [X] T023 [US1] Add `ratingSum` and `ratingCount` to the place item in `apps/api/src/persistence/place.repository.ts`, defaulting absent to zero so places written before this feature read correctly
- [X] T024 [US1] Create `apps/api/src/ratings/rating.service.ts` with `rate`, `withdraw` and `summaryFor`, validating score 1–5 server-side
- [X] T025 [US1] Create `apps/api/src/ratings/ratings.module.ts` and register it in the app module
- [X] T026 [US1] Add `PUT /v1/places/:placeId/rating` to `apps/api/src/modules/places/place.controller.ts` per the contract, returning rating plus summary
- [X] T027 [US1] Add `DELETE /v1/places/:placeId/rating` to `apps/api/src/modules/places/place.controller.ts`
- [X] T028 [US1] Include `ratingSummary` in the place response in `apps/api/src/modules/places/place.service.ts`, with `average: null` when the count is zero
- [X] T029 [US1] Apply `@RateLimit` to both rating endpoints in `apps/api/src/modules/places/place.controller.ts`
- [X] T030 [US1] Verify `pnpm --filter @sih/api test tests/integration/auth-surface.spec.ts` passes with the two new routes correctly absent from the public set

### Mobile for US1

- [X] T031 [P] [US1] Create a `RatingControl` component in `apps/mobile/src/features/places/RatingControl.tsx` with testIDs `rating-star-1` … `rating-star-5` and `rating-summary`
- [X] T032 [US1] Render the summary and the control on the place screen in `apps/mobile/src/features/places/PlaceScreen.tsx`, showing "not yet rated" when the count is zero
- [X] T033 [US1] Wire the container in `apps/mobile/src/screens/index.tsx` — **every hook above every return**, per `__tests__/hooks-before-return.test.ts`
- [X] T034 [US1] Add `rating` methods to the mobile data layer in `apps/mobile/src/data/places.ts`
- [X] T035 [US1] Add a container test in `apps/mobile/src/__tests__/screens.test.tsx` that presses the rating control and asserts the data layer was called — a screen test is not a container test (003/T053)

### Measuring US1's criteria

- [X] T036 [P] [US1] Journey in `apps/e2e/journeys/ratings.spec.ts`: rate a place, read the average back as a second person — **SC-001**, asserting the round trip under one second
- [X] T037 [P] [US1] Journey in `apps/e2e/journeys/ratings.spec.ts` comparing displayed average against the individual ratings for 100 places — **SC-002**
- [X] T038 [US1] Journey step in `apps/e2e/journeys/ratings.spec.ts` asserting withdrawal recomputes the average — **FR-003**
- [ ] T039 [US1] Add rating shape assertions to `apps/e2e/journeys/response-shape.spec.ts` — six surfaces in this codebase shipped returning raw candidate rows, and nothing asked

**Checkpoint**: ratings work end to end. US1 is shippable alone.

---

## Phase 4: User Story 2 — Reviews on a place (Priority: P2)

**Goal**: reviews readable on the place page, blocked in both directions, reportable and
removable.

**Independent Test**: write a review, read it as another person, report it as a third,
remove it as a moderator, confirm it is gone and the log survives.

### Contract tests first — G4

- [ ] T040 [US2] Write the review decision table from `contracts/visibility-matrix-addendum.md` § 2 into `apps/api/tests/visibility/matrix.spec.ts`: 4 states × 4 viewers
- [ ] T041 [US2] Add the two blocking assertions to `apps/api/tests/visibility/matrix.spec.ts`, **both directions separately** — a single-direction check passes against an implementation that only looks one way (**SC-004**)
- [ ] T042 [US2] Add a routing probe for the review path to `apps/api/tests/visibility/surface-routing.spec.ts`, distinct from the place page's post probe
- [ ] T043 [US2] Run `pnpm --filter @sih/api test tests/visibility/` and confirm T040–T042 **fail** before any review read path exists — a contract test that passes before its implementation is testing nothing

### Tests for US2

- [ ] T044 [P] [US2] Integration test in `apps/api/tests/integration/review-moderation.spec.ts`: report → queue → remove → gone from the place page, log readable afterwards — **SC-006**
- [ ] T045 [P] [US2] Integration test in `apps/api/tests/integration/review-removal-aggregate.spec.ts` asserting a removed review leaves the average — **FR-016**, research R6
- [ ] T046 [P] [US2] Negative test in `apps/e2e/journeys/negative.spec.ts` fetching a blocked person's review through a **raw request**, not the data layer — Principle III

### Implementation for US2

- [ ] T047 [US2] Add `body` and `removedByModeration` to the rating item in `apps/api/src/persistence/rating.repository.ts`
- [ ] T048 [US2] Accept optional `body` (max 2000 chars) in `apps/api/src/ratings/rating.service.ts`
- [X] T049 [US2] **Pulled forward into US1.** The contract's `RatingWithSummary` returns a `Review`, which requires a hydrated author — so US1's `PUT` needed the responder. Building it in US1 was the alternative to US1 growing a second review shape that US2 then replaced, which is the two-responders defect. Created `apps/api/src/ratings/review-query.service.ts` as the **one responder**, hydrating the author — the same argument as one `VisibilityFilter`, applied to the shape rather than the decision
- [ ] T050 [US2] Route review reads through `decideAuthored()` in `apps/api/src/ratings/review-query.service.ts`
- [ ] T051 [US2] Add `GET /v1/places/:placeId/reviews` to `apps/api/src/modules/places/place.controller.ts` with **optional auth**, add `'GET /places/:placeId/reviews'` to `EXPECTED_PUBLIC` in `apps/api/tests/integration/auth-surface.spec.ts` (per T015), and confirm the client sends a token on it — 002's third defect was exactly this
- [ ] T052 [US2] Add cursor pagination to the review list in `apps/api/src/ratings/review-query.service.ts`, sorting by `updatedAt` in memory per data-model.md § A35's stated limit
- [ ] T053 [US2] Flip the surface row to `built: true` in `apps/api/tests/visibility/surfaces.ts` and update the asserted total to **480**
- [ ] T054 [US2] Verify `surface-routing.spec.ts` reports `surfaces without a routing probe yet: none`

### Safety for US2 — G2, and inside this story on purpose

- [ ] T055 [US2] Add `review` to the `subjectType` enum in `apps/api/src/modules/safety/safety.controller.ts` and `ReportSubjectType` in `apps/api/src/persistence/report.repository.ts`, **together with** its branch in `apps/api/src/modules/safety/report.service.ts` resolving the compound `<placeId>:<userId>` id — one change, per T014
- [ ] T056 [US2] Add the `review` branch to `remove_content` in `apps/api/src/modules/moderation/moderation.controller.ts`, setting `removedByModeration` **and** decrementing the place aggregate (research R6)
- [ ] T057 [US2] Confirm the removal decision is written to the append-only log in `apps/api/src/modules/moderation/moderation.controller.ts`, and that the log survives the review
- [ ] T058 [US2] Notify the review's author on removal in `apps/api/src/modules/moderation/moderation.controller.ts`, reusing the path FR-045 already uses for posts

### Mobile for US2

- [ ] T059 [P] [US2] Create `ReviewList` in `apps/mobile/src/features/places/ReviewList.tsx` with testIDs `review-<userId>` and `review-list`
- [ ] T060 [P] [US2] Add review composition to `apps/mobile/src/features/places/RatingControl.tsx` with testID `review-body-input`
- [ ] T061 [US2] Wire both into the place container in `apps/mobile/src/screens/index.tsx`
- [ ] T062 [US2] Add a report affordance for a review in `apps/mobile/src/features/safety/SafetyActions.tsx` with testID `report-review`

### Measuring US2's criteria

- [ ] T063 [P] [US2] Journey in `apps/e2e/journeys/reviews.spec.ts` covering write → read → block both directions → absent — **SC-004**
- [ ] T064 [US2] Add review shape assertions to `apps/e2e/journeys/response-shape.spec.ts` — hydrated author, score, body, timestamps
- [ ] T065 [US2] Run `pnpm --filter @sih/api test tests/visibility/matrix.spec.ts` and confirm **480 assertions, zero skipped** — **SC-005**

**Checkpoint**: reviews are readable, blockable, reportable and removable. G2 satisfied.

---

## Phase 5: User Story 3 — Group conversations (Priority: P3)

**Goal**: conversations with 3–20 people, with requests, adding and leaving.

**Independent Test**: create a group of three, send from each, add a fourth, have one leave.

### G1 — identity and migration, before anything else in this story

**⚠️ Nothing else in Phase 5 may start until T066–T075 are done and SC-008 passes.**

- [ ] T066 [US3] Write `apps/api/tests/integration/conversation-migration.spec.ts` **first**: create conversations through the *previous* write path, run the backfill, assert they are readable under their original ids — **SC-008**
- [ ] T067 [US3] Run `pnpm --filter @sih/api test tests/integration/conversation-migration.spec.ts` and confirm it fails before the migration exists
- [ ] T068 [US3] Add `kind`, `name`, `nameRemovedByModeration` and `creatorId` to `ConversationItem` in `apps/api/src/persistence/conversation.repository.ts`
- [ ] T069 [US3] Add `joinedAt`, `leftAt` and `addedBy` to `ConversationParticipantItem` in `apps/api/src/persistence/conversation.repository.ts`
- [ ] T070 [US3] Add the `CONV#`/`PARTICIPANT#` member row (A40) to `apps/api/src/persistence/conversation.repository.ts`, written in the same transaction as everything else
- [ ] T071 [US3] Extend `conversationIdFor` in `apps/api/src/conversations/conversation-id.ts` so a pair keeps its derived id and a group gets a ULID (research R1), keeping the existing pair test that asserts B's id for A equals A's id for B
- [ ] T072 [US3] Move the `state` authority to the participant row in `apps/api/src/persistence/conversation.repository.ts`, leaving the conversation item's field in place and unread (research R2, R9)
- [ ] T073 [US3] Write `apps/api/scripts/backfill-conversation-state.ts` copying each conversation's `state` onto its participant rows
- [ ] T074 [US3] Run `apps/api/scripts/backfill-conversation-state.ts`, then `tests/integration/conversation-migration.spec.ts`, and confirm it passes — **SC-008**
- [ ] T075 [US3] Add `tests/unit/conversation-state-authority.spec.ts` asserting no read path consults the conversation item's `state`, so the removed authority cannot come back

### ConversationAccess for N participants

- [ ] T076 [US3] Change `ConversationAccess` in `apps/api/src/conversations/conversation-access.ts` to take a participant set with per-participant state, keeping it **pure** — no I/O, which is what lets its table be a unit test
- [ ] T077 [US3] Extend the ConversationAccess table in `apps/api/tests/unit/conversation-access.spec.ts` to cover a third participant and the `left` state
- [ ] T078 [US3] Add `left` to `ConversationState` in `apps/api/src/conversations/conversation-access.ts` and to the shared types

### Creation, adding, leaving

- [ ] T079 [US3] Implement group creation in `apps/api/src/modules/conversations/conversation.service.ts`, routing a single-participant request to the existing pair path — **FR-027**, which falls out of R1 rather than needing its own check
- [ ] T080 [US3] Enforce the 20-participant cap server-side in `apps/api/src/modules/conversations/conversation.service.ts` — **FR-031**, and research R3 explains why the number is load-bearing
- [ ] T081 [US3] Implement the FR-023 block check in `apps/api/src/modules/conversations/conversation.service.ts`, reading both directions against every current participant through `RelationshipCache`
- [ ] T082 [US3] Make the refusal **byte-identical** to every other "cannot add" refusal in `apps/api/src/modules/conversations/conversation.service.ts` — **FR-023a**; a distinct code, message or latency leaks the block just as well as saying so
- [ ] T083 [US3] Implement `POST /v1/conversations/groups` in `apps/api/src/modules/conversations/conversation.controller.ts`, returning 200 not 201 (the contract explains why)
- [ ] T084 [US3] Implement `POST /v1/conversations/:id/participants` in `apps/api/src/modules/conversations/conversation.controller.ts`, idempotent for somebody already present
- [ ] T085 [US3] Implement `POST /v1/conversations/:id/leave` in `apps/api/src/modules/conversations/conversation.controller.ts`, keeping the participant row so sent messages stay attributable — **FR-021**
- [ ] T086 [US3] Emit join and leave into the message stream in `apps/api/src/modules/conversations/conversation.service.ts` — **FR-030**, membership change is history, not a silent mutation
- [ ] T087 [US3] Handle the empty group in `apps/api/src/modules/conversations/conversation.service.ts` — **FR-029**, no readable messages once nobody is left
- [ ] T088 [US3] Apply `@RateLimit` to group creation and participant addition in `apps/api/src/modules/conversations/conversation.controller.ts`
- [ ] T089 [US3] Route group invitations from non-followed people to Requests in `apps/api/src/modules/conversations/conversation.service.ts` — **FR-022**, the same rule the pair case applies

### Group name as content

- [ ] T090 [P] [US3] Accept and store an optional name (max 60) in `apps/api/src/modules/conversations/conversation.service.ts`
- [ ] T091 [P] [US3] Add `conversation-name` to the `subjectType` enum and `ReportSubjectType`, **together with** its branch in `apps/api/src/modules/safety/report.service.ts` — one change, per T014
- [ ] T092 [US3] Add the `conversation-name` branch to `remove_content` in `apps/api/src/modules/moderation/moderation.controller.ts` — **blanks the name, leaves the conversation readable** (research R8)

### Delivery

- [ ] T093 [US3] Fan a group message out to every participant's waiter in `apps/api/src/modules/conversations/message.service.ts`, reusing `EventWaiter` unchanged (research R10)
- [ ] T094 [US3] Run `pnpm verify:register` and confirm `docs/verification/divergence-register.md` gains no entry — `D-004-1` already covers long-poll and participant count does not change any reason it exists

### Mobile for US3

- [ ] T095 [P] [US3] Create group creation in `apps/mobile/src/features/conversations/NewGroupScreen.tsx` with testIDs `new-group`, `group-participant-<handle>`, `group-name-input`, `create-group`
- [ ] T096 [P] [US3] Show participants and a leave affordance in `apps/mobile/src/features/conversations/ConversationScreen.tsx` with testIDs `group-participants`, `leave-group`
- [ ] T097 [US3] Render group rows in `apps/mobile/src/features/conversations/InboxScreen.tsx` identified by name or participants, **never** by last-message preview — 004's flow-ordering defect
- [ ] T098 [US3] Wire the containers in `apps/mobile/src/screens/index.tsx`
- [ ] T099 [US3] Add group methods to the mobile data layer in `apps/mobile/src/data/conversations.ts`
- [ ] T100 [US3] Add container tests in `apps/mobile/src/__tests__/screens.test.tsx` pressing create, add and leave

### Measuring US3's criteria

- [ ] T101 [P] [US3] Journey in `apps/e2e/journeys/groups.spec.ts`: three people, everyone receives everything — **SC-007**
- [ ] T102 [P] [US3] Journey in `apps/e2e/journeys/groups.spec.ts` asserting delivery latency is no worse than the pair case at the same concurrency — **SC-007**
- [ ] T103 [US3] Journey in `apps/e2e/journeys/groups.spec.ts` using `consistently()` to assert a stranger's group invite notifies nobody, held over a window rather than checked once — **SC-009**
- [ ] T104 [US3] Journey in `apps/e2e/journeys/groups.spec.ts` asserting a person who left receives nothing further and their messages remain — **SC-011**
- [ ] T105 [US3] Negative test in `apps/e2e/journeys/negative.spec.ts` exceeding the cap through a raw request — **SC-010**
- [ ] T106 [US3] Negative test in `apps/e2e/journeys/negative.spec.ts` comparing the blocked-add refusal against another "cannot add" refusal as **literal responses** — **SC-012**

**Checkpoint**: all three stories independently functional.

---

## Phase 6: Polish and cross-cutting

- [ ] T107 [P] Add `.maestro/20-rate-place.yaml` driving rate → read the average back
- [ ] T108 [P] Add `.maestro/21-group-chat.yaml` driving create → send → add → leave
- [ ] T109 Run `node scripts/verify-maestro-ids.mjs` and confirm every new selector resolves — the dynamic-prefix hole is closed, so a selector under a prefix must now resolve against real literals
- [ ] T110 Extend `scripts/android-device-pass.sh` to assert both new flows **through the service**: a `PUT /v1/places/:placeId/rating` 200 and a group message 201 in the API log
- [ ] T111 [P] Seed a group fixture in `apps/e2e/scripts/seed-group-fixture.ts`, printing what the flows need and **asserting the fixture produced it** before the flows depend on it
- [ ] T112 Add `verify:register` and the new suites to `.github/workflows/ci.yml`
- [ ] T113 [P] Update `CLAUDE.md` with what 005 established and what it did not
- [ ] T114 Write the run record in `docs/verification/runs/`, listing each criterion **with the command that measured it**, and each criterion not met
- [ ] T115 Dispatch `.github/workflows/android-emulator.yml` and record the result — free on this public repository, and the only place native behaviour is observed
- [ ] T116 Run the full CI step list from quickstart.md § 8 locally before pushing — not a proxy for it; two red builds in 002 came from assuming typecheck/lint/tests covered CI

---

## Dependencies and execution order

### Phase dependencies

- **Phase 1 (Setup)**: no dependencies
- **Phase 2 (Foundational)**: depends on Phase 1 — **blocks all stories**
- **Phase 3 (US1)**: after Phase 2
- **Phase 4 (US2)**: after US1 — a review is text on a rating, so this is a genuine dependency, not a preference
- **Phase 5 (US3)**: after Phase 2; independent of US1 and US2
- **Phase 6 (Polish)**: after the stories it covers

### Story dependencies

- **US1 (P1)**: independent. MVP.
- **US2 (P2)**: **depends on US1.** The only real cross-story dependency here.
- **US3 (P3)**: independent of both, but G1 makes its own first ten tasks serial.

### Parallel opportunities

Two lanes, not more:

- **Lane A**: US1 → US2 (ratings, then reviews)
- **Lane B**: US3 (G1 prologue, then groups)

Within a lane, tasks marked `[P]` touch different files. Across lanes, the single-owner
files in plan.md make a third agent actively harmful — `keys.ts`, `matrix.spec.ts`,
`screens/index.tsx` and `place.controller.ts` are each wanted by both lanes.

Per CLAUDE.md's sizing note, two lanes does not justify more than two agents.

---

## Implementation strategy

### MVP

Phase 1 → Phase 2 → Phase 3. Stop and validate: a person can rate a place and everyone sees
it. That is shippable.

### Incremental

1. Setup + Foundational → boundary has one block check with two callers, guards fail correctly
2. US1 → ratings work → validate
3. US2 → reviews, with their safety controls in the same story → validate
4. US3 → groups, after migration proves existing conversations survive → validate
5. Polish → device pass, run record

### What to watch for

Five traps this codebase has already fallen into, each with a task that catches it:

- **The surface ratchet** (T016, T053). Adding surface 12 with `built: true` before the code
  exists fails the ratchet; adding it with `built: false` and forgetting to flip it reports
  462 green assertions while a surface is uncovered.
- **The `@Public()` decorator** (T015). Inserting a method above an existing `@Get` moves the
  decorator onto the new method. Typecheck and lint stay clean. This happened twice in 004.
- **Hooks after a return** (T033, T061, T098). Dead code or "rendered more hooks than during
  the previous render", with every screen test still green.
- **Candidate rows as responses** (T039, T064). Six surfaces shipped this way.
- **Waiting for a duration instead of a condition** (T103). Use `eventually` and
  `consistently`; a negative assertion checked once against an async pipeline is green,
  worthless and indistinguishable from a real pass.

---

## Criterion → measuring task

The constitution requires this mapping to exist, so it is written out rather than implied.

| Criterion | Measured by |
|---|---|
| SC-001 | T036 |
| SC-002 | T037 |
| SC-003 | T018 |
| SC-004 | T041, T046, T063 |
| SC-005 | T065 |
| SC-006 | T044 |
| SC-007 | T101, T102 |
| SC-008 | T066, T074 |
| SC-009 | T103 |
| SC-010 | T105 |
| SC-011 | T104 |
| SC-012 | T106 |

**Total: 116 tasks** — 4 setup, 12 foundational, 23 US1, 26 US2, 41 US3, 10 polish.
