---

description: "Task list for feature 002: production readiness"
---

# Tasks: Production Readiness — Close the Evidence and Scale Gaps

**Input**: Design documents from `/specs/002-production-readiness/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Test tasks ARE included. The constitution requires contract-defining tests to precede
the implementations they govern, and this feature is entirely about producing evidence.

**Organization**: Grouped by user story so each is independently implementable and testable.

**Revised after `/speckit-analyze`**: three CRITICAL findings closed — US3 is now implementation
then verification (three of four divergences had no production code); the end-to-end suite now
drives the app's own data layer rather than the generated client; and 002/SC-002 gained the
gated task that can actually satisfy it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1–US4, mapping to spec.md
- **⛔ GATED**: cannot be completed without the project owner's explicit approval to spend.
  **These tasks MUST NOT be ticked on the basis of preparation work.** Feature 001 shipped with
  20 tasks ticked that had only their logic written; the gate marker exists so that cannot
  recur silently.
- **Criterion IDs are namespaced.** `001/SC-005` is feature 001's feed-latency criterion;
  `002/SC-005` is this feature's video-playable criterion. They are different things and the
  bare form is ambiguous.

## Path Conventions

pnpm workspace monorepo: `apps/api`, `apps/mobile`, `apps/e2e` (new), `apps/workers`, `infra`,
`packages/shared`, plus `docs/verification/` for durable evidence records.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffolding that every later phase needs.

- [X] T001 Create the `apps/e2e` workspace package with `package.json`, `tsconfig.json` and a jest config in `apps/e2e/`, registered in `pnpm-workspace.yaml`
- [X] T002 [P] Add a `generate:client` script to `packages/shared/package.json` that regenerates `src/client/operations.generated.ts` from `specs/001-interest-media-sharing/contracts/openapi.yaml`
- [X] T003 [P] Create the evidence tree `docs/verification/` with `runs/`, an empty `approvals.md`, and a `README.md` stating that these are dated records, not design documents
- [X] T004 [P] Add `apps/e2e` to the root `typecheck` and `lint` sweeps and confirm both still pass
- [X] T005 [P] Add `report:outcomes` to `apps/workers/package.json` and `verify:register`, `verify:teardown`, `spend-report` to `infra/package.json`, each pointing at a file created later in its own phase
- [X] T006 Extend `.github/workflows/ci.yml` with the `apps/e2e` test step and the client-drift check, passing `--passWithNoTests` to the e2e step so CI stays green until Phase 3 populates it

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Nothing in US1 or US2 can be measured until the API can be started, driven over
HTTP, and reset between runs.

**⚠️ CRITICAL**: no user story work begins until this phase completes.

- [X] T007 Implement an API process fixture in `apps/e2e/support/api-process.ts` that boots the API under `tsx` (the production runner, matching `smoke:boot`), waits for readiness, and shuts down cleanly
- [X] T008 [P] Implement store reset in `apps/e2e/support/reset.ts` that recreates the `sih-main` table and the `sih-media` bucket between runs, reusing `infra/scripts/create-local-table.ts` and `create-local-bucket.ts` rather than duplicating them
- [X] T009 [P] Implement test-identity minting in `apps/e2e/support/identity.ts` that issues tokens through the same local JWT issuer the API validates against — never by constructing a token the API would not itself accept
- [X] T010 Implement a raw HTTP helper in `apps/e2e/support/http.ts` that issues unadorned requests, used by the walking skeleton and by the negative journeys, which must bypass the app's own guards to exercise the hostile-client path (Principle III)
- [X] T011 [P] Add a fixture-media helper in `apps/e2e/support/media.ts` producing a small real JPEG and a short real MP4, including one JPEG carrying GPS EXIF for the metadata-strip journey
- [X] T012 [P] Configure `apps/e2e/tsconfig.json` `rootDir` and path mappings so it can import from `apps/mobile/src/` — cross-package imports already broke the build once in feature 001, so settle it before any journey depends on it
- [X] T013 Verify `apps/e2e` can boot the API, mint a token, call `GET /health` via the raw helper, and tear down — the walking skeleton, before any journey is written
- [X] T014 [P] Add `docs/verification/runs/TEMPLATE-journey-run.md` matching the Journey Run shape in data-model.md
- [X] T015 [P] Add `docs/verification/runs/TEMPLATE-load-measurement.md` matching the Load Measurement shape, with `transport` and `bottleneck` as required fields

**Checkpoint**: the API can be driven over real HTTP from a test process with a clean store.

---

## Phase 3: User Story 1 — The app and the service actually work together (Priority: P1) 🎯 MVP

**Goal**: Every core journey completes **through the app's own data layer** against a running
API over HTTP, and a contract disagreement fails the build.

**Independent Test**: `pnpm --filter @sih/e2e test` — all 10 core and 4 negative journeys pass
against a live API. Delivers the first evidence the product works at all.

### Tests for User Story 1 (write first — these define the contract)

- [ ] T016 [P] [US1] Write the journey suite skeleton in `apps/e2e/journeys/` with all 14 journeys from `contracts/e2e-journeys.md` present and failing, so the contract is enumerated before any of it is satisfied
- [X] T017 [P] [US1] Write the client-drift check in `apps/e2e/journeys/contract-drift.spec.ts` (or as a CI step) asserting the regenerated client matches the committed one

### Implementation for User Story 1 — the missing data layer

- [ ] T018 [US1] Create `apps/mobile/src/data/client.ts` — the app's single API entry point, wrapping the generated client with base URL and auth token handling
- [ ] T019 [P] [US1] Create `apps/mobile/src/data/errors.ts` mapping RFC 9457 problem+json responses, including extension members, to typed client-side errors
- [ ] T020 [P] [US1] Create `apps/mobile/src/data/interests.ts` — catalogue browse, search, follow, unfollow
- [ ] T021 [P] [US1] Create `apps/mobile/src/data/posts.ts` — presign, upload, publish, read, edit visibility, delete
- [ ] T022 [P] [US1] Create `apps/mobile/src/data/feed.ts` — home feed and interest space reads with pagination
- [ ] T023 [P] [US1] Create `apps/mobile/src/data/engagement.ts` — comments and reactions
- [ ] T024 [P] [US1] Create `apps/mobile/src/data/safety.ts` — report and block
- [ ] T025 [US1] Create `apps/mobile/src/data/session.ts` — sign-in, token storage, refresh, sign-out (depends on T018)
- [ ] T026 [US1] Implement `apps/e2e/support/client.ts` driving **the mobile data layer** (`apps/mobile/src/data/`), not the generated client directly — the client and the API's contract tests are both generated from one document and agree by construction, so driving the client alone would prove nothing about the app's own request construction (depends on T018–T025)

### Implementation for User Story 1 — wiring the screens

- [ ] T027 [US1] Wire `apps/mobile/src/App.tsx` to the data layer so the tab shell loads real data instead of receiving props only
- [ ] T028 [P] [US1] Wire `apps/mobile/src/features/feed/HomeFeedScreen.tsx` to `data/feed.ts`, preserving the existing empty and error states
- [ ] T029 [P] [US1] Wire `apps/mobile/src/features/discover/` screens to `data/interests.ts`
- [ ] T030 [P] [US1] Wire `apps/mobile/src/features/publish/ComposeScreen.tsx` to `data/posts.ts`, keeping the existing publish-blocked reasons
- [ ] T031 [P] [US1] Wire `apps/mobile/src/features/posts/` screens to `data/posts.ts`
- [ ] T032 [P] [US1] Wire `apps/mobile/src/features/engagement/` screens to `data/engagement.ts`
- [ ] T033 [P] [US1] Wire `apps/mobile/src/features/safety/` screens to `data/safety.ts`
- [ ] T034 [US1] Confirm the 31 existing render tests in `apps/mobile/src/__tests__/` still pass with the data layer injected, adapting them to inject a fake data layer rather than deleting assertions

### Implementation for User Story 1 — the journeys

- [ ] T035 [P] [US1] Implement J-01 sign in and J-02 browse catalogue in `apps/e2e/journeys/onboarding.spec.ts`, via the data layer
- [ ] T036 [P] [US1] Implement J-03 follow an interest in `apps/e2e/journeys/interests.spec.ts`, via the data layer
- [ ] T037 [US1] Implement J-04 publish an image post in `apps/e2e/journeys/publish-image.spec.ts`, driving the real presign → upload → publish sequence through the data layer
- [ ] T038 [US1] Implement J-05 publish a video post in `apps/e2e/journeys/publish-video.spec.ts`, asserting the post reaches a ready state
- [ ] T039 [P] [US1] Implement J-06 home feed and J-07 interest space in `apps/e2e/journeys/feed.spec.ts`, asserting only followed-interest posts appear (Principle I)
- [ ] T040 [P] [US1] Implement J-08 comment in `apps/e2e/journeys/engagement.spec.ts`, via the data layer
- [ ] T041 [P] [US1] Implement J-09 report and J-10 block in `apps/e2e/journeys/safety.spec.ts`, asserting the block takes effect on every read surface immediately
- [ ] T042 [US1] Implement negative journeys N-01 to N-04 in `apps/e2e/journeys/negative.spec.ts` using the **raw HTTP helper** from T010, deliberately bypassing the data layer so each drives the path a hostile client would take (Principle III)
- [ ] T043 [US1] Wire `pnpm --filter @sih/e2e test` into CI and confirm the whole suite passes on a runner with no cloud credentials
- [ ] T044 [US1] Write the Tier B device runbook in `docs/verification/tier-b-runbook.md`, recording that the cloud sandbox has no public inbound route and this tier must run on a developer machine
- [ ] T045 [US1] ⛔ **Requires physical hardware** — perform one Tier B pass on an iOS and an Android device and record two Journey Runs in `docs/verification/runs/`. Not completable in the cloud sandbox; do not tick from a simulator

**Checkpoint**: the product is demonstrably functional end to end for the first time.

---

## Phase 4: User Story 2 — The feed stays fast when the app is busy (Priority: P2)

**Goal**: Establish what is actually saturating, then meet the latency budget without weakening
any guarantee.

**Independent Test**: `bench:ceiling` then `bench:feed-load` produce a Load Measurement with a
named bottleneck, and `test:visibility` still reports 294/294.

**Note on what this phase can and cannot close.** The free part establishes *attribution*.
`002/SC-002` (2 seconds at 10,000 concurrent) cannot be closed without T052, because FR-008
requires a production-shaped datastore. Until T052 runs, the criterion is reported as
**unverified** — not as met, and not as failed.

### Measurement validity first (research R1)

- [ ] T046 [US2] Rework `apps/api/bench/harness.ts` so concurrency is issued from a worker pool rather than `Promise.all` on one event loop, and so each run records how saturation was established
- [ ] T047 [US2] Add `apps/api/bench/ceiling.bench.ts` measuring three ceilings separately: the generator's own, the application's with the datastore replaced by a fixed-latency stub, and DynamoDB Local's in isolation
- [ ] T048 [US2] Rework `apps/api/bench/feed-load.bench.ts` to drive the API **over HTTP** against a booted process, replacing the in-process `feed.homeFeed()` calls, and to emit `transport: http`
- [ ] T049 [P] [US2] Make both benches emit the Load Measurement shape from data-model.md, with `bottleneck` and `bottleneck_evidence` as required fields and `undetermined` permitted
- [ ] T050 [US2] Run `seed:load`, then `bench:ceiling` and `bench:feed-load`, and record the result as a Load Measurement in `docs/verification/runs/`
- [ ] T051 [US2] Write the attribution conclusion into `specs/002-production-readiness/research.md` under R1, stating plainly which of the three is the binding ceiling, or that it is undetermined
- [ ] T052 [US2] ⛔ **GATED** — obtain approval, then re-run `bench:feed-load` against provisioned DynamoDB at the target concurrency and record a Load Measurement with `transport: http` and the real datastore. This is the only task that can close `002/SC-002` (FR-008)

### Conditional — only if T051 attributes the ceiling to the application

- [ ] T053 [US2] **Conditional.** If and only if T051 names the application as the bottleneck, design the D1 hybrid in `specs/002-production-readiness/research.md`: candidate references for high-volume interests only, with `VisibilityFilter` still running at read time over every candidate
- [ ] T054 [US2] **Conditional.** Implement the candidate index write path in `apps/api/src/modules/feed/`, touching `feed.service.ts` — single-owner file, do not edit concurrently with T055
- [ ] T055 [US2] **Conditional.** Implement the read path in `apps/api/src/modules/feed/feed.service.ts` so materialised candidates and read-time assembly merge behind one interface
- [ ] T056 [US2] **Conditional.** Re-run `bench:feed-load` and record whether the budget is met at the target concurrency

### The gate — runs regardless of whether the conditional tasks ran

- [ ] T057 [US2] Run `pnpm --filter @sih/api test:visibility` and confirm 294/294 across all 7 surfaces, with no surface or state removed — reject any change that reduces coverage regardless of the latency it achieves
- [ ] T058 [US2] Add a test that flips a post's visibility **during** a concurrency run and asserts it disappears from every surface immediately — FR-007 requires the guarantee to hold under load, and T057 only exercises it at rest
- [ ] T059 [P] [US2] Run the follow-expansion tests in `apps/api/tests/unit/follow-expansion.spec.ts` and confirm a person-follow still cannot widen a feed beyond followed interests (Principle I, 001/FR-033)
- [ ] T060 [US2] If the budget cannot be met without weakening a guarantee, record the conflict in `specs/002-production-readiness/research.md` and raise it with the project owner — do not weaken the guarantee to make the number pass (FR-011)
- [ ] T061 [P] [US2] Update `CLAUDE.md` and `specs/001-interest-media-sharing/validation-report.md` with the attributed result, replacing the unattributed 11.8s figure

**Checkpoint**: the latency question is answered with evidence rather than inference.

---

## Phase 5: User Story 3 — Guarantees are proven where real people will use them (Priority: P3)

**Goal**: Every divergence is registered with its implementation state, the missing production
code is written, and — once approved — each is verified.

**Independent Test**: `verify:register` passes, the port-parity test shows no `aws` adapter
throws `NOT_PROVISIONED`, and `verify:teardown --dry-run` reports correctly. The runs are gated.

**Read this first.** Checked against the code rather than the file list: D-1 is a real
implementation that has never executed, D-2 and D-3 are stubs that throw, and D-4 has no adapter
file at all. Three of four entries need code written before verification is even possible.
Writing it costs nothing and is **not** gated.

### Preparation — no approval needed, no spend

- [ ] T062 [P] [US3] Write the live register `docs/verification/divergence-register.md` with D-1 object store, D-2 transcode, D-3 identity, D-4 media delivery, each carrying its `implementation` state (FR-031), per `contracts/divergence-register.md`
- [ ] T063 [US3] Implement `infra/scripts/verify-register.ts` checking the register against the set of **capabilities** that have a production path — not against the file list in `apps/api/src/adapters/aws/`, since D-4 legitimately has no file yet — and wire it into CI as `verify:register`
- [ ] T064 [P] [US3] Add a test asserting DynamoDB is **absent** from the register, so a future contributor cannot add a spurious entry and make completeness unfalsifiable (research R4, 001/D9)
- [ ] T065 [P] [US3] Write the D-1 runbook in `docs/verification/runbooks/d1-object-store.md`, stating the proof before the run: presign semantics, consistency, and error taxonomy behave as the local path does
- [ ] T066 [P] [US3] Write the D-2 runbook in `docs/verification/runbooks/d2-transcode.md`, whose proof is both `002/SC-005` (95% of videos playable within 60 seconds) **and** FR-017 (location metadata absent by the time anyone can read the media, driven as a hostile client would)
- [ ] T067 [P] [US3] Write the D-3 runbook in `docs/verification/runbooks/d3-identity.md` covering token shape, claims, expiry and refresh
- [ ] T068 [P] [US3] Write the D-4 runbook in `docs/verification/runbooks/d4-media-delivery.md`, whose proof includes that an unauthorised viewer requesting media directly does not receive it (FR-019)
- [ ] T069 [US3] Implement `infra/scripts/verify-teardown.ts` listing resources by run tag and failing if any survive, invoked as its own command and never from a `finally` block (research R6)
- [ ] T070 [P] [US3] Implement `infra/scripts/spend-report.ts` recording actual spend per run against its approval ceiling
- [ ] T071 [P] [US3] Add `docs/verification/runs/TEMPLATE-verification-run.md` and the Approval Record format in `docs/verification/approvals.md`
- [ ] T072 [US3] Dry-run `verify:teardown --dry-run` and `pnpm --filter @sih/infra synth` and confirm both work with no account and no credentials

### Implementation — the production code that does not exist yet (no approval needed)

- [ ] T073 [US3] Implement `MediaConvertMediaProcessor` in `apps/api/src/adapters/aws/mediaconvert-media-processor.ts`, replacing the three `NOT_PROVISIONED` throws, including `processImage` location-metadata stripping (FR-017) — unit-tested against a mocked SDK, since running it is gated
- [ ] T074 [US3] Implement `CognitoIdentityProvider.verify()` in `apps/api/src/adapters/aws/cognito-identity-provider.ts`, replacing the `NOT_PROVISIONED` throw
- [ ] T075 [P] [US3] Create the media-delivery adapter in `apps/api/src/adapters/aws/` for D-4 — no file exists today, so the CDN path has no implementation at all
- [ ] T076 [US3] Add a port-parity test in `apps/api/tests/contract/` asserting every `aws` adapter implements every port method and that none throws `NOT_PROVISIONED` — this is what makes a missing production implementation fail a build instead of waiting for an analysis pass

### The verifications themselves

- [ ] T077 [US3] ⛔ **GATED** — obtain and record an Approval Record with a spend ceiling before any environment is created. Nothing below may start without it
- [ ] T078 [US3] ⛔ **GATED** — execute the D-1 runbook, record a Verification Run, confirm teardown independently
- [ ] T079 [US3] ⛔ **GATED** — execute the D-2 runbook and record whether `002/SC-005` and FR-017 hold on the production path
- [ ] T080 [US3] ⛔ **GATED** — execute the D-3 runbook and record the result
- [ ] T081 [US3] ⛔ **GATED** — execute the D-4 runbook, including the unauthorised-direct-fetch check
- [ ] T082 [US3] ⛔ **GATED** — run `verify:teardown` and `spend-report` for every run and confirm zero surviving resources within 24 hours

**Checkpoint**: Principle V is discharged for every registered divergence, or the register
truthfully says which are unimplemented and which are unverified.

---

## Phase 6: User Story 4 — Stated outcomes are measured against real usage (Priority: P4)

**Goal**: Each real-usage criterion has a defined window and an honest aggregate report.

**Independent Test**: `report:outcomes` runs against seeded data and produces every criterion
with its target, misses included and small cells suppressed.

### Preparation — no approval needed, no spend

- [ ] T083 [P] [US4] Write `docs/verification/measurement-windows.md` declaring population, window and cadence in advance, defaulting to 50+ participants over 14+ continuous days (FR-024)
- [ ] T084 [US4] Implement `apps/workers/src/reports/outcome-report.ts` producing the Outcome Measure shape from data-model.md
- [ ] T085 [P] [US4] Implement `001/SC-001` and `001/SC-004` derivation from the analytics events already emitted by `apps/mobile/src/lib/analytics.ts`
- [ ] T086 [P] [US4] Implement `001/SC-007` and `001/SC-008` derivation from post-to-interest assignment and interest merge records
- [ ] T087 [US4] Implement `001/SC-010` derivation from the append-only moderation log, counting reports with no decision as **missed** — assert this with a test, since averaging over decided reports only would report the best number when moderation is failing worst (FR-027)
- [ ] T088 [P] [US4] Implement the 20-person suppression floor and assert suppressed cells are marked, never rounded or merged (FR-028)
- [ ] T089 [P] [US4] Implement the `unmeasurable` path for windows under 50 participants or under 14 days, and for criteria not derivable from recorded data (FR-025, FR-030)
- [ ] T090 [US4] Write a test in `apps/workers/tests/` proving the report contains no field from which an individual could be identified
- [ ] T091 [US4] Run `report:outcomes` against seeded local data and confirm every criterion appears, including as `unmeasurable`

### The measurement itself

- [ ] T092 [US4] ⛔ **GATED** — obtain approval for a deployment and a participant group
- [ ] T093 [US4] ⛔ **GATED** — open the declared window and let it run to its stated end without adjusting it after seeing data
- [ ] T094 [US4] ⛔ **GATED** — produce and publish the report, stating every miss

**Checkpoint**: the five criteria are answered with real numbers, or honestly reported as
unmeasured.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T095 [P] Update `CLAUDE.md` with what this feature established: the corrected `001/SC-011` framing, the `apps/e2e` package, the divergence register, and the fact that the `aws` adapters were stubs
- [ ] T096 [P] Update `specs/001-interest-media-sharing/validation-report.md` so its SC table reflects measured results rather than "bench written"
- [ ] T097 Run the full local verification sweep from `quickstart.md` and confirm every command passes
- [ ] T098 [P] Add the single-owner file table for this feature to `CLAUDE.md`, so parallel agents do not overwrite each other
- [ ] T099 Re-run `/speckit-analyze` to check for drift between spec, plan and tasks after implementation
- [ ] T100 Confirm no task marked ⛔ is ticked without a corresponding Approval Record and Verification Run on disk, and that the register's `implementation` states match the code

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies
- **Foundational (Phase 2)**: depends on Setup — **blocks US1 and US2**
- **US1 (Phase 3)**: depends on Phase 2. T026 depends on the data layer (T018–T025) existing, which is why the e2e client factory lives here and not in Foundational
- **US2 (Phase 4)**: depends on Phase 2. Independent of US1
- **US3 (Phase 5)**: preparation and implementation depend only on Setup; **verification is gated on approval**
- **US4 (Phase 6)**: preparation depends only on Setup; **execution is gated on approval and on a deployment existing**
- **Polish (Phase 7)**: depends on whichever stories were completed

### Story Dependencies

- US1 and US2 are genuinely independent and can run in parallel after Phase 2
- US3's implementation block (T073–T076) is independent of everything and needs no approval —
  it is the largest piece of unblocked work outside US1
- **US4 execution depends on US3** — the report needs a deployed product with real users. This
  is the only genuine cross-story dependency

### Single-owner files — two agents editing these will overwrite each other

| File | Tasks |
|---|---|
| `apps/api/src/modules/feed/feed.service.ts` | T054, T055 |
| `apps/api/bench/harness.ts` | T046, T049 |
| `apps/mobile/src/App.tsx` | T027 |
| `apps/e2e/support/client.ts` | T026 |
| `CLAUDE.md` | T061, T095, T098 |
| `specs/002-production-readiness/research.md` | T051, T053, T060 |
| `.github/workflows/ci.yml` | T006, T043, T063 |
| `docs/verification/divergence-register.md` | T062, T063 |

### Parallel Opportunities

- T002, T003, T004, T005 in Setup
- T008, T009, T011, T012, T014, T015 in Foundational
- The six data-layer modules T019–T024 are separate files and fully parallel
- The screen-wiring tasks T028–T033 are separate files and fully parallel
- The journey specs T035, T036, T039, T040, T041 are separate files
- The four runbooks T065–T068 are separate files
- US1, US2, and US3's preparation-and-implementation block can be worked by three agents once
  Phase 2 completes

---

## Parallel Example: User Story 1 data layer

```bash
# After T018 lands, these six are independent files:
Task: "Create apps/mobile/src/data/errors.ts"
Task: "Create apps/mobile/src/data/interests.ts"
Task: "Create apps/mobile/src/data/posts.ts"
Task: "Create apps/mobile/src/data/feed.ts"
Task: "Create apps/mobile/src/data/engagement.ts"
Task: "Create apps/mobile/src/data/safety.ts"
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 US1
2. **Stop and validate**: `pnpm --filter @sih/e2e test` green means the product demonstrably
   works end to end — something that has never been true before
3. This alone is worth shipping to the branch, with no spend

### Incremental delivery

1. Setup + Foundational → the API can be driven over HTTP
2. US1 → the app and service demonstrably work together **(MVP)**
3. US2 free part → the feed's ceiling is attributed; `002/SC-002` stays unverified
4. US3 preparation + implementation → the missing `aws` adapters exist and the register is
   mechanically enforced
5. **Approval decision point** → T052, then US3 and US4 execution, or an honest record that
   they are unverified

### What "done" means for this feature

US1 complete, US2 attributed, US3 implemented and prepared, US4 prepared — and, if approval is
withheld, a divergence register and an outcome report saying plainly which guarantees remain
unproven. An honest "unverified" is a successful outcome for this feature. A ticked box over
unrun work is not.

---

## Notes

- ⛔ tasks require an Approval Record on disk before they may be started, and a Verification Run
  on disk before they may be ticked
- [P] tasks are different files with no incomplete dependencies
- Commit after each task or logical group
- T053–T056 are conditional on T051's finding. If the ceiling is the emulator or the harness,
  they are not done — they are **not applicable**, and should be struck through rather than
  ticked
