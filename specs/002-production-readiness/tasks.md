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

- [X] T016 [P] [US1] Write the journey suite skeleton in `apps/e2e/journeys/` with all 14 journeys from `contracts/e2e-journeys.md` present and failing, so the contract is enumerated before any of it is satisfied
- [X] T017 [P] [US1] Write the client-drift check in `apps/e2e/journeys/contract-drift.spec.ts` (or as a CI step) asserting the regenerated client matches the committed one

### Implementation for User Story 1 — the missing data layer

- [X] T018 [US1] Create `apps/mobile/src/data/client.ts` — the app's single API entry point, wrapping the generated client with base URL and auth token handling
- [X] T019 [P] [US1] Create `apps/mobile/src/data/errors.ts` mapping RFC 9457 problem+json responses, including extension members, to typed client-side errors
- [X] T020 [P] [US1] Create `apps/mobile/src/data/interests.ts` — catalogue browse, search, follow, unfollow
- [X] T021 [P] [US1] Create `apps/mobile/src/data/posts.ts` — presign, upload, publish, read, edit visibility, delete
- [X] T022 [P] [US1] Create `apps/mobile/src/data/feed.ts` — home feed and interest space reads with pagination
- [X] T023 [P] [US1] Create `apps/mobile/src/data/engagement.ts` — comments and reactions
- [X] T024 [P] [US1] Create `apps/mobile/src/data/safety.ts` — report and block
- [X] T025 [US1] Create `apps/mobile/src/data/session.ts` — sign-in, token storage, refresh, sign-out (depends on T018)
- [X] T026 [US1] Implement `apps/e2e/support/client.ts` driving **the mobile data layer** (`apps/mobile/src/data/`), not the generated client directly — the client and the API's contract tests are both generated from one document and agree by construction, so driving the client alone would prove nothing about the app's own request construction (depends on T018–T025)

### Implementation for User Story 1 — wiring the screens

- [X] T027 [US1] Wire `apps/mobile/src/App.tsx` to the data layer so the tab shell loads real data instead of receiving props only
- [X] T028 [P] [US1] Wire `apps/mobile/src/features/feed/HomeFeedScreen.tsx` to `data/feed.ts`, preserving the existing empty and error states
- [X] T029 [P] [US1] Wire `apps/mobile/src/features/discover/` screens to `data/interests.ts`
- [X] T030 [P] [US1] Wire `apps/mobile/src/features/publish/ComposeScreen.tsx` to `data/posts.ts`, keeping the existing publish-blocked reasons
- [X] T031 [P] [US1] Wire `apps/mobile/src/features/posts/` screens to `data/posts.ts`
- [X] T032 [P] [US1] Wire `apps/mobile/src/features/engagement/` screens to `data/engagement.ts`
- [X] T033 [P] [US1] Wire `apps/mobile/src/features/safety/` screens to `data/safety.ts`
- [X] T034 [US1] Confirm the 31 existing render tests in `apps/mobile/src/__tests__/` still pass with the data layer injected, adapting them to inject a fake data layer rather than deleting assertions

### Implementation for User Story 1 — the journeys

- [X] T035 [P] [US1] Implement J-01 sign in and J-02 browse catalogue in `apps/e2e/journeys/onboarding.spec.ts`, via the data layer
- [X] T036 [P] [US1] Implement J-03 follow an interest in `apps/e2e/journeys/interests.spec.ts`, via the data layer
- [X] T037 [US1] Implement J-04 publish an image post in `apps/e2e/journeys/publish-image.spec.ts`, driving the real presign → upload → publish sequence through the data layer
- [X] T038 [US1] Implement J-05 publish a video post in `apps/e2e/journeys/publish-video.spec.ts`, asserting the post reaches a ready state
- [X] T039 [P] [US1] Implement J-06 home feed and J-07 interest space in `apps/e2e/journeys/feed.spec.ts`, asserting only followed-interest posts appear (Principle I)
- [X] T040 [P] [US1] Implement J-08 comment in `apps/e2e/journeys/engagement.spec.ts`, via the data layer
- [X] T041 [P] [US1] Implement J-09 report and J-10 block in `apps/e2e/journeys/safety.spec.ts`, asserting the block takes effect on every read surface immediately
- [X] T042 [US1] Implement negative journeys N-01 to N-04 in `apps/e2e/journeys/negative.spec.ts` using the **raw HTTP helper** from T010, deliberately bypassing the data layer so each drives the path a hostile client would take (Principle III)
- [X] T043 [US1] Wire `pnpm --filter @sih/e2e test` into CI and confirm the whole suite passes on a runner with no cloud credentials
- [X] T044 [US1] Write the Tier B device runbook in `docs/verification/tier-b-runbook.md`, recording that the cloud sandbox has no public inbound route and this tier must run on a developer machine
- [X] T045 [US1] **RESTATED 2026-09-06** (owner decision: no real phone, no paid resources). Drive every reachable journey through the app's own screens against a running API, in a browser on CI — `apps/e2e/browser/`, which renders `apps/mobile/src` and asserts on what the server received, not on the DOM alone. **Done**: sign-in through the screen, a rejected token, discover to interest space with the follow read back from the API, publish, comment read back from the API, reacting read back from the API, opening a notification, and Block present on the safety screen.
  - **Superseded twice.** Original: "Requires physical hardware … do not tick from a simulator." Then, 2026-09-06 morning: a cloud device (emulator) is acceptable. Now: neither is required, because **the emulator has never booted** — six CI runs, no device ever appeared. `android-emulator.yml` stays in the tree, `workflow_dispatch` only, unproven and documented as such.
  - **What this genuinely covers:** the app's real screens, real navigation and real requests, on every change, at no cost. It caught thirteen defects that every render test and every data-layer journey passed.
  - **One screen remains unmounted: `MediaPickerScreen`.** Compose takes its media from the caller (a bundled sample), because there is no native picker dependency in this build and a journey that drives an OS gallery dialog fails for reasons unrelated to the product. Mounting the picker over a fabricated list would make an audit pass without making anything reachable, so it is recorded here instead. Choosing media from a device library is untested.
  - **What it does not cover, recorded in spec.md under *Risks this spec no longer covers*:** camera and photo-library permissions, backgrounding, real network conditions, vendor OS behaviour, battery and thermal effects, and **iOS in its entirety**. A browser is not a phone. Nothing here should be read as device verification.

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

- [X] T046 [US2] Rework `apps/api/bench/harness.ts` so concurrency is issued from a worker pool rather than `Promise.all` on one event loop, and so each run records how saturation was established
- [X] T047 [US2] Add `apps/api/bench/ceiling.bench.ts` measuring three ceilings separately: the generator's own, the application's with the datastore replaced by a fixed-latency stub, and DynamoDB Local's in isolation
- [X] T048 [US2] Rework `apps/api/bench/feed-load.bench.ts` to drive the API **over HTTP** against a booted process, replacing the in-process `feed.homeFeed()` calls, and to emit `transport: http`
- [X] T049 [P] [US2] Make both benches emit the Load Measurement shape from data-model.md, with `bottleneck` and `bottleneck_evidence` as required fields and `undetermined` permitted *(bench:feed-load emits the full shape via `reportMeasurement`; bench:ceiling produces the three-way attribution that populates its `bottleneck` field rather than a Load Measurement of its own — they are different measurements, not the same one twice)*
- [X] T050 [US2] Run `seed:load`, then `bench:ceiling` and `bench:feed-load`, and record the result as a Load Measurement in `docs/verification/runs/`
- [X] T051 [US2] Write the attribution conclusion into `specs/002-production-readiness/research.md` under R1, stating plainly which of the three is the binding ceiling, or that it is undetermined
- [X] T052 [US2] **RESTATED 2026-09-06** (owner decision: no paid cloud resources anywhere in this spec). Was: obtain approval, then re-run `bench:feed-load` against provisioned DynamoDB at 10,000 concurrent. Now: `bench:ceiling` measures the generator, the datastore and the application shape **apart**, over HTTP against the container stack, and every report must name which of the three was binding. Done on 2026-09-05 — generator 187,439 req/s, DynamoDB Local 827 req/s, application shape 5,574 req/s — which is why the D1 hybrid was correctly **not** built. **This does not answer `002/SC-002` at 10,000 concurrent**; that is withdrawn to the risk table in spec.md, not met (FR-008)

### Conditional — only if T051 attributes the ceiling to the application

**T051 attributed the ceiling to the datastore (the emulator), not the
application. These four are therefore NOT APPLICABLE, marked `[~]` rather than
ticked.** Ticking them would claim work that was correctly not done; leaving them
open would suggest work still owed.

- [~] T053 [US2] **Conditional.** **NOT APPLICABLE** — If and only if T051 names the application as the bottleneck, design the D1 hybrid in `specs/002-production-readiness/research.md`: candidate references for high-volume interests only, with `VisibilityFilter` still running at read time over every candidate
- [~] T054 [US2] **Conditional.** **NOT APPLICABLE** — Implement the candidate index write path in `apps/api/src/modules/feed/`, touching `feed.service.ts` — single-owner file, do not edit concurrently with T055
- [~] T055 [US2] **Conditional.** **NOT APPLICABLE** — Implement the read path in `apps/api/src/modules/feed/feed.service.ts` so materialised candidates and read-time assembly merge behind one interface
- [~] T056 [US2] **Conditional.** **NOT APPLICABLE** — Re-run `bench:feed-load` and record whether the budget is met at the target concurrency

### The gate — runs regardless of whether the conditional tasks ran

- [X] T057 [US2] Run `pnpm --filter @sih/api test:visibility` and confirm 294/294 across all 7 surfaces, with no surface or state removed — reject any change that reduces coverage regardless of the latency it achieves
- [X] T058 [US2] Add a test that flips a post's visibility **during** a concurrency run and asserts it disappears from every surface immediately — FR-007 requires the guarantee to hold under load, and T057 only exercises it at rest
- [X] T059 [P] [US2] Run the follow-expansion tests in `apps/api/tests/unit/follow-expansion.spec.ts` and confirm a person-follow still cannot widen a feed beyond followed interests (Principle I, 001/FR-033)
- [X] T060 [US2] *(No conflict arose: the budget was not missed by the design — the emulator was the ceiling. Nothing to escalate.)* If the budget cannot be met without weakening a guarantee, record the conflict in `specs/002-production-readiness/research.md` and raise it with the project owner — do not weaken the guarantee to make the number pass (FR-011)
- [X] T061 [P] [US2] Update `CLAUDE.md` and `specs/001-interest-media-sharing/validation-report.md` with the attributed result, replacing the unattributed 11.8s figure

**Checkpoint**: the latency question is answered with evidence rather than inference.

---

## ~~Phase 5: User Story 3~~ — REMOVED 2026-09-05

**T062–T082 are withdrawn.** The project owner decided AWS is not the deployment
target, so the four adapters those tasks existed to register, runbook and verify
were deleted rather than left in the tree unexecuted.

What went, and why it is not a loss:
| Removed | Reason |
|---|---|
| `apps/api/src/adapters/aws/*` (4 adapters) | Never executed once. Keeping them meant four untested implementations behind a profile switch |
| The `aws` runtime profile | Nothing selects it any more; `RUNTIME_PROFILE` now accepts `local` only, and says so if given anything else |
| The divergence register, its four runbooks, `verify:register` | There is no divergence to register — one implementation per port |
| T077–T082 (the gated verifications) | Nothing left to verify |

Kept: `verify:teardown` and `spend-report`, because SC-002's deferred measurement
would still create billable resources if it is ever approved.

**This does not repeal Principle V.** The moment a second implementation of any
port is introduced, the divergence must be registered and verified on the
production path before release. The rule is in the constitution; only the
instance is gone.

---

## Phase 6: User Story 4 — Stated outcomes are measured against real usage (Priority: P4)

**Goal**: Each real-usage criterion has a defined window and an honest aggregate report.

**Independent Test**: `report:outcomes` runs against seeded data and produces every criterion
with its target, misses included and small cells suppressed.

### Preparation — no approval needed, no spend

- [X] T083 [P] [US4] Write `docs/verification/measurement-windows.md` declaring population, window and cadence in advance, defaulting to 50+ participants over 14+ continuous days (FR-024)
- [X] T084 [US4] Implement `apps/workers/src/reports/outcome-report.ts` producing the Outcome Measure shape from data-model.md
- [X] T085 [P] [US4] Implement `001/SC-001` and `001/SC-004` derivation from the analytics events already emitted by `apps/mobile/src/lib/analytics.ts`
- [X] T086 [P] [US4] Implement `001/SC-007` and `001/SC-008` derivation from post-to-interest assignment and interest merge records
- [X] T087 [US4] Implement `001/SC-010` derivation from the append-only moderation log, counting reports with no decision as **missed** — assert this with a test, since averaging over decided reports only would report the best number when moderation is failing worst (FR-027)
- [X] T088 [P] [US4] Implement the 20-person suppression floor and assert suppressed cells are marked, never rounded or merged (FR-028)
- [X] T089 [P] [US4] Implement the `unmeasurable` path for windows under 50 participants or under 14 days, and for criteria not derivable from recorded data (FR-025, FR-030)
- [X] T090 [US4] Write a test in `apps/workers/tests/` proving the report contains no field from which an individual could be identified
- [X] T091 [US4] Run `report:outcomes` against seeded local data and confirm every criterion appears, including as `unmeasurable`

### The measurement itself

- [~] T092 [US4] **WITHDRAWN 2026-09-06** (owner decision: no task may require a real person). Was: obtain approval for a deployment and a participant group. A real-usage outcome needs people using a deployed product; a synthetic substitute would measure the harness, not anyone's behaviour, and reporting it as a usage figure would be false. Recorded in spec.md under *Risks this spec no longer covers* and left genuinely unanswered
- [~] T093 [US4] **WITHDRAWN 2026-09-06** (owner decision: no task may require a real person). Was: open the declared window and let it run to its stated end without adjusting it after seeing data. A real-usage outcome needs people using a deployed product; a synthetic substitute would measure the harness, not anyone's behaviour, and reporting it as a usage figure would be false. Recorded in spec.md under *Risks this spec no longer covers* and left genuinely unanswered
- [~] T094 [US4] **WITHDRAWN 2026-09-06** (owner decision: no task may require a real person). Was: produce and publish the report, stating every miss. A real-usage outcome needs people using a deployed product; a synthetic substitute would measure the harness, not anyone's behaviour, and reporting it as a usage figure would be false. Recorded in spec.md under *Risks this spec no longer covers* and left genuinely unanswered

**Checkpoint**: the five criteria are answered with real numbers, or honestly reported as
unmeasured.

---

## Phase 8: Browser journeys (added 2026-09-05)

**Why this exists.** Written when T045 looked unreachable from here — every
route to a device appeared blocked by the environment's network allowlist. Two
of those three claims have since turned out to be wrong, and the correction is
worth keeping because the same mistake was made three times in one session:

- **A local Android SDK is not blocked.** The owner widened the allowlist on
  2026-09-05 and an APK now builds end to end here (`tier-b-runbook.md`).
- **A device farm still needs a hosted API**, so that route is gated on the
  hosting decision, not on the allowlist.
- **The emulator route needs neither**, because the emulator and the API sit on
  one CI runner and talk over `10.0.2.2`.

What has *not* changed is the split below: T045 was covering two different
risks, and only one of them needs hardware.

| Risk | Covered by |
|---|---|
| Permissions, camera, photo library, backgrounding, real network | Hardware only — **still open**, and a cloud device does not close it |
| The UI has never rendered against a live server | Closed by the browser journeys (T046–T048) |
| **A person cannot actually reach most of the product** | Found 2026-09-06: the shell mounted three of six containers and had no sign-in screen, so publish, comments, report and block were unreachable on any device. Closed by wiring the navigation |

The second is real and untested: the data layer is exercised by 22 journeys over
HTTP, and the components by 31 render tests, but the two have never run together.
Chromium and Playwright are preinstalled, so the app's own screens can be driven
in a browser against the running API.

This is **not** a substitute for T045 and must never be recorded as one.

- [X] T101 Add web support to `apps/mobile` (`react-native-web`) so the real screens render in a browser
- [X] T102 Drive the core journeys through the rendered UI against a live API with Playwright, in `apps/e2e/browser/`
- [X] T103 Wire the browser journeys into CI
- [X] T104 Record in the Tier B runbook what browser journeys do and do not cover
- [X] T105 Persist the auth token so a person stays signed in, and cover authenticated screens in the browser journeys — found the feed returning index rows rather than posts

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T095 [P] Update `CLAUDE.md` with what this feature established: the corrected `001/SC-011` framing, the `apps/e2e` package, the divergence register, and the fact that the `aws` adapters were stubs
- [X] T096 [P] Update `specs/001-interest-media-sharing/validation-report.md` so its SC table reflects measured results rather than "bench written"
- [X] T097 Run the full local verification sweep from `quickstart.md` and confirm every command passes
- [X] T098 [P] Add the single-owner file table for this feature to `CLAUDE.md`, so parallel agents do not overwrite each other
- [X] T099 Re-run `/speckit-analyze` to check for drift between spec, plan and tasks after implementation
- [X] T100 Confirm no task marked ⛔ is ticked without a corresponding Approval Record and Verification Run on disk, and that the register's `implementation` states match the code

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

---

## Traceability

Added after the `/speckit-analyze` re-run at T099, which found the work complete
but the mapping implicit. The constitution requires each task to trace to a
requirement; naming the FR inside a task description covered only some of them,
so the map is stated once here instead.
| Requirement | Tasks | State |
|---|---|---|
| FR-001 core journeys through the app's data layer | T026, T035–T042 | done |
| FR-002 journeys run on every change | T043 | done |
| FR-003 contract drift fails the build | T017, T006 | done |
| FR-004 no cloud account needed | T043 | done |
| FR-005 physical-device pass | T044, **T045** | runbook done; pass needs hardware |
| FR-006 latency budget under concurrency | T046–T050, **T052** | measured locally; budget **deferred/unverified** |
| FR-007 visibility immediate under load | T058 | done |
| FR-008 production-shaped datastore | **T052** | **deferred** — SC-002 reported unverified |
| FR-009 latency per level, first breach | T047, T049 | done |
| FR-010 re-verify the visibility contract | T057 | done, 294/294 |
| FR-011 escalate rather than weaken | T060 | no conflict arose |
| FR-012 generator is not the limit | T045–T047 | done — `bench:ceiling` |
| FR-024 windows declared in advance | T083 | done |
| FR-025 unmeasurable, never estimated | T089 | done |
| FR-026 misses reported | T084, T090 | done |
| FR-027 undecided reports count as missed | T087 | done, with a test |
| FR-028 aggregates only, suppression floor | T088, T090 | done |
| FR-029 purpose limit | T090 | done — asserted structurally |
| FR-030 too-small window says so | T089 | done |
| Success criterion | Tasks | State |
|---|---|---|
| 002/SC-001 journeys on every change, none stand-in-only | T026, T035–T043 | **met** — 22 assertions green |
| 002/SC-002 2s p95 at 10,000 concurrent | T046–T050, **T052** | **deferred, unverified** — ceiling was the emulator, not the design |
| 002/SC-003 visibility contract passes in full | T057, T058 | **met** — 294/294, 7/7 surfaces |
| 002/SC-004 every divergence verified before release | — | **withdrawn** — no divergences remain |
| 002/SC-005 video playable in 60s | 001 `bench:transcode` | **met** — ffmpeg is now the only implementation, so the local measurement is the production one |
| 002/SC-006 journeys on a physical device | **T045** | needs hardware |
| 002/SC-007 outcome reported within a cycle | T084, **T092–T094** | job built; window **deferred** |
| 002/SC-008 environments confirmed destroyed | T069 (partial) | applies only if SC-002's deferred run is approved |
| 002/SC-009 spend within approval | T070 | **zero spend, zero approvals** to date |

**Bold** task ids are gated on the project owner's approval, or on hardware this
environment does not have.
