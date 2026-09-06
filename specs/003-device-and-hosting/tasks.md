---

description: "Task list for feature 003: verified in the cloud, end to end"
---

# Tasks: Verified in the cloud, end to end

**Input**: Design documents from `/specs/003-device-and-hosting/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Test tasks are included where the spec's acceptance depends on them — the durability
check, the Android journeys and the permission paths are the deliverable, not a supplement to
it.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

## Path Conventions

Monorepo: `apps/api`, `apps/mobile`, `apps/e2e`, `infra`, `.maestro`, `scripts`,
`.github/workflows`, `docs/verification`.

## Ordering note that matters

**US3 comes before US2.** Research R3: durability work done on the current datastore is effort
a switch would discard, so the datastore decision is made first. US1 is independent of both and
runs alongside.

---

## Phase 1: Setup

**Purpose**: The record formats this feature's evidence is written into.

- [X] T001 [P] Add the Runtime Attempt record template at `docs/verification/runs/TEMPLATE-runtime-attempt.md`, with `date`, `configuration`, `outcome`, `runtime_output` and `conclusion` per `data-model.md` — and a line stating that a record with an empty `runtime_output` is invalid
- [X] T002 [P] Add `runtime` and `evidence` to the Journey Run template at `docs/verification/runs/TEMPLATE-journey-run.md`, restricting `runtime` to `android-emulator` or `browser` and noting that `android-device` and `ios` are not producible by this feature
- [X] T003 [P] Add the required `datastore` field to the Load Measurement template at `docs/verification/runs/TEMPLATE-load-measurement.md`, recording what the datastore actually was and whether it was the same software a deployment would run

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The one guard every later task depends on — that a failure produces evidence.

**⚠️ CRITICAL**: T004 blocks every Android task. Its whole point is that attempt seven is
informative whatever it returns.

- [X] T004 Write `scripts/emulator-launch.sh`: install the SDK packages, create the AVD, launch the emulator **directly** with `> "$OUT/runtime-output.log" 2>&1`, poll `adb` for `sys.boot_completed` on a bounded wait, and on timeout `cat` the log before exiting non-zero. It MUST write `runtime-output.log` on every path, including success
- [X] T005 Rewrite `.github/workflows/android-emulator.yml` to call `scripts/emulator-launch.sh` instead of `reactivecircus/android-emulator-runner`, keeping the KVM udev step, and upload the artifact with `if: always()` so the output survives a failure
- [X] T006 Verify locally before spending a run: execute `scripts/emulator-launch.sh` in the sandbox, confirm it produces a non-empty `runtime-output.log` **and** that the log contains the emulator's own messages rather than only the script's. The sandbox has no `/dev/kvm`, so this is a test of the capture, not of booting

**Checkpoint**: the emulator can no longer fail silently.

---

## Phase 3: User Story 1 - The app runs on Android, and the agent drives it (Priority: P1)

**Goal**: The first frame the product has ever rendered on Android, and the journeys driven on
it.

**Independent test**: Dispatch the workflow; the artifact contains a non-blank capture of the
app's own interface and one result per journey.

### The attempt, which succeeds by reporting

- [ ] T007 [US1] Dispatch `android-emulator.yml` and record a Runtime Attempt in `docs/verification/runs/` from T001's template, attaching `runtime-output.log` **whatever the outcome**
- [ ] T008 [US1] Read the captured output and write the conclusion it supports — not one it merely permits. If it names a cause, fix that cause; if it does not, say so. **Do not form a hypothesis that the output does not evidence** (six previous attempts did exactly that)

### Only if the runtime boots

- [ ] T009 [US1] Extend `scripts/android-device-pass.sh` to install the APK, launch it, and fail loudly if the process is not alive afterwards — a crash on start is a failure, not a slow start
- [ ] T010 [US1] Capture `home.png` in `scripts/android-device-pass.sh` and **assert it is not blank** (the only Android capture in this project's history is entirely black; a blank capture MUST fail the run, per contract `android-journey-run.md`)
- [ ] T011 [US1] Assert in `scripts/android-device-pass.sh` that the service's own request log shows a request that arrived from the app — a blank screen renders tabs too, so this is what separates a working app from a shell
- [ ] T012 [P] [US1] Verify the `.maestro/` flows resolve against the app as built: every `id:` used must exist in `apps/mobile/src` (six were wrong when first written; check, do not assume)
- [ ] T013 [US1] Run the Maestro journeys on the emulator from `scripts/android-device-pass.sh`, asserting each journey's effect **through the service** rather than the view hierarchy, per contract `android-journey-run.md`
- [ ] T014 [US1] Add the FR-033 negative case as `.maestro/12-interest-follow-does-not-widen.yaml`: a followed person's post in an unfollowed interest MUST be absent from the feed (Principle I, non-negotiable)
- [ ] T015 [US1] Record a Journey Run in `docs/verification/runs/` with `runtime: android-emulator`, one result per journey, `not run` where a journey was not attempted, and the non-blank capture attached

### If it does not boot

- [ ] T016 [US1] Record the conclusion with the captured output as evidence, report Android unverified, and update `docs/verification/tier-b-runbook.md` and `CLAUDE.md` with what the output showed. **Do not attempt an eighth run without a new, evidenced hypothesis**

**Checkpoint**: Android is either verified with evidence, or unverified with evidence. Neither
outcome is a guess.

---

## Phase 4: User Story 3 - The datastore choice is settled (Priority: P1)

**Goal**: Decide before anything is built on it. Blocks US2.

**Independent test**: A Datastore Decision record exists with each option's migration cost
counted from real classes.

- [X] T017 [US3] Count the migration surface: enumerate every repository class under `apps/api/src/persistence/*.repository.ts` (14 at time of writing) and, for each, what changes under the alternative — key construction, query shape, transaction use
- [X] T018 [US3] Establish for each option whether it **runs as itself outside a deployment** or only as a stand-in. This is what decides whether US5 has an answer at all (research R3)
- [X] T019 [US3] Write the Datastore Decision record per `data-model.md` — options, migration cost per option, `runs_as_itself_locally` per option, the decision, and who made it. A record without the counted cost is a preference, not a decision
- [X] T020 [US3] Update D3 in `specs/001-interest-media-sharing/research.md` with the revisit outcome, preserving the original reasoning rather than overwriting it
- [X] T021 [US3] If the decision differs from what is implemented, size the migration as its own feature and **stop** — do not begin it inside 003, and do not let US2 harden the superseded choice

**Checkpoint**: the datastore question is answered, and US2 knows what it is making durable.

---

## Phase 5: User Story 2 - The service keeps what it is given (Priority: P1)

**Goal**: A stack that survives a restart. Depends on US3.

**Independent test**: Write, restart everything, read it all back.

### Storage

- [ ] T022 [US2] Replace `-inMemory` with `-dbPath /data` in `docker-compose.yml` and mount a volume for the datastore, keeping `-sharedDb` (verified 2026-09-06: an item survives the container being destroyed and recreated on the same volume)
- [ ] T023 [US2] Mount a volume for object storage in `docker-compose.yml` so uploads survive a container recreate, not merely a restart
- [ ] T024 [US2] Make `infra/scripts/create-local-table.ts` and `create-local-bucket.ts` idempotent against pre-existing data — with a persistent volume they now run against a stack that already has state
- [ ] T025 [P] [US2] Add the volumes to `.gitignore` so a developer's local data is never committed

### Events

- [ ] T026 [US2] Write a durable event bus at `apps/api/src/adapters/local/durable-event-bus.ts` that records each published event and its handled state before delivery
- [ ] T027 [US2] Replay unhandled events on startup in `apps/api/src/adapters/local/durable-event-bus.ts`, so an event published before a crash is handled after the restart. **This is the highest-value task in the story**: an event lost here reproduces 002's worst defect — a post that never leaves `pending` and is visible only to its author, permanently
- [ ] T028 [US2] Swap the binding in `apps/api/src/adapters/adapters.module.ts` from `InProcessEventBus` to the durable bus, keeping the port unchanged
- [X] T029 [US2] Add a no-double-delivery case to `apps/api/tests/unit/durable-event-bus.spec.ts`: an event marked handled MUST NOT be replayed (a double-delivered `post.commented` sends a second notification)

### Identity

- [X] T030 [US2] Remove the built-in development default for the JWT secret in `apps/api/src/config/configuration.ts` so the service refuses to boot without an explicitly configured secret, and refuse tokens signed with the known development value (FR-007, Principle III)
- [X] T031 [US2] Update every harness that mints tokens — `apps/e2e/support/identity.ts`, `apps/api/scripts/mint-device-token.ts` — to supply the secret explicitly rather than relying on a default

### Proof

- [X] T032 [US2] Write `apps/e2e/durability/durability.spec.ts`: write a person, a followed interest, a published post with media, a comment and a reaction; stop **every** component; start them; read all of it back. A partial pass is a failure, per contract `durability-contract.md`
- [X] T033 [US2] Add an event-durability case to `apps/e2e/durability/durability.spec.ts`: publish, kill the process before the handler runs, restart, and assert the effect landed
- [X] T034 [US2] Add a rejected-token case to `apps/e2e/journeys/negative.spec.ts` asserting a development-secret token is refused, and that the refusal is indistinguishable from any other invalid token
- [X] T035 [US2] Run `pnpm --filter @sih/api test:visibility` against the durable stack and confirm it passes **in full**, with no reduction in surfaces or states (FR-009, Principle II — non-negotiable)
- [X] T036 [US2] Wire the durability suite into `.github/workflows/ci.yml`

**Checkpoint**: nothing written to the product is lost by restarting it.

---

## Phase 6: User Story 4 - Media comes from the device's own library (Priority: P2)

**Goal**: The first step of the core act stops being faked. Depends on US1.

**Independent test**: Pick an image from the emulator's library and publish it; refuse the
permission and see an explanation.

- [ ] T037 [US4] Install a native image picker in `apps/mobile/package.json` and regenerate the native project with `expo prebuild`
- [ ] T038 [US4] Mount `MediaPickerScreen` in `ComposeContainer` (`apps/mobile/src/screens/index.tsx`) so media comes from the picker rather than `sampleMedia.ts` — the last screen in the app that nothing reaches
- [ ] T039 [US4] Keep `apps/mobile/src/features/publish/sampleMedia.ts` as the fallback when no picker is available, so the browser journeys continue to exercise publish
- [ ] T040 [US4] Place a test image in the emulator's library from `scripts/android-device-pass.sh`: `adb push` **followed by a media-scan broadcast** — a pushed file is invisible to the picker without it (research R4)
- [ ] T041 [P] [US4] Add `.maestro/10-publish-from-library.yaml` driving pick-and-publish with the permission granted
- [ ] T042 [P] [US4] Add `.maestro/11-permission-refused.yaml` using Maestro's `setPermissions` to deny, asserting the app explains what it needs rather than appearing broken (FR-012)
- [ ] T043 [US4] Record the two permission paths in the Journey Run under `docs/verification/runs/`

**Checkpoint**: publishing starts where a person would start it.

---

## Phase 7: User Story 5 - What the datastore does under load (Priority: P2)

**Goal**: A load figure that says what it measured. Depends on US2 and US3.

**Independent test**: The report names the binding component and what the datastore was.

- [ ] T044 [US5] Add the required `datastore` field to `reportMeasurement` in `apps/api/bench/harness.ts`, and make a measurement without it fail rather than default
- [ ] T045 [US5] Run `bench:ceiling` against the durable stack and record in `docs/verification/runs/` the three-way attribution — generator, datastore, application shape
- [ ] T046 [US5] Run `bench:feed-load` against the durable stack and record in `docs/verification/runs/` a Load Measurement with `transport`, `datastore`, concurrency reached, latencies and binding constraint
- [ ] T047 [US5] If the datastore is a stand-in, report the result **as a measurement of the stand-in** — never as a statement about the product (FR-013). 001 reported an emulator's p95 as a property of the design and it drove a proposal to build a hybrid that was not warranted

**Checkpoint**: the load number says what it is a number about.

---

## Phase 8: Polish & Cross-Cutting

- [ ] T048 [P] Update `CLAUDE.md` with what the emulator output actually showed, replacing the current entry which records only that it fails
- [ ] T049 [P] Update `docs/verification/tier-b-runbook.md`: the route is proven or disproven, not "unproven"
- [ ] T050 [P] Update `specs/003-device-and-hosting/spec.md` status to reflect the delivered state, with every unreached outcome reported unverified rather than dropped
- [ ] T051 Confirm the Out of Scope items are still reported honestly in `specs/003-device-and-hosting/spec.md`, `CLAUDE.md` and `docs/verification/`: real usage unanswered, iOS unverified, no public deployment
- [ ] T052 Run the full CI step list from `.github/workflows/ci.yml` before the final push — the actual list, not a proxy for it. Two red builds in 002 came from checking a subset and assuming it covered CI

---

## Dependencies

```text
Phase 1 (Setup) ──┐
Phase 2 (T004-T006, blocking) ──> US1 (Phase 3) ──> US4 (Phase 6)
                                   US3 (Phase 4) ──> US2 (Phase 5) ──> US5 (Phase 7)
                                                                   └──> Phase 8
```

- **US1 and US3 are independent of each other** and can run in parallel after Phase 2.
- **US2 must not start before US3.** Durability work on a datastore that a decision would
  replace is discarded effort (research R3).
- **US4 needs US1**; there is nothing to drive a picker on until Android runs.
- **US5 needs US2 and US3**; measuring a stack that loses data on restart measures nothing.

## Parallel opportunities

- T001, T002, T003 — three separate record templates.
- T012 (flow ids) runs alongside T009–T011.
- T041, T042 — two independent flow files.
- T048, T049, T050 — three separate documents.
- **US1 and US3 whole phases** — the largest parallel win, and the two P1 stories that unblock
  everything else.

## Single-owner files — do not edit concurrently

| File | Tasks |
|---|---|
| `scripts/android-device-pass.sh` | T009, T010, T011, T013, T040 |
| `.github/workflows/android-emulator.yml` | T005 |
| `docker-compose.yml` | T022, T023 |
| `apps/e2e/durability/durability.spec.ts` | T032, T033, T034 |
| `apps/mobile/src/screens/index.tsx` | T038, T039 |
| `.github/workflows/ci.yml` | T036 |

## Implementation strategy

**MVP is US1 alone** — and it is an MVP in an unusual sense. Its value is not "the emulator
boots"; it is "the emulator's failure is visible". T004–T008 deliver that, and they deliver it
whether or not a device ever appears. Everything after T008 is contingent on what the output
says.

**Then US3**, which is a day of reading and one written decision, and which determines whether
US5 is answerable at all.

**Then US2**, the largest genuine engineering in this feature and the one with the clearest
product value independent of everything else: today a restart loses every post, a container
recreate loses every upload, and an event published before a crash is dropped silently.

**Stop conditions.** Any task that turns out to require a billable resource stops and reports
(FR-015). Any outcome that cannot be measured is reported unverified rather than substituted
(FR-016). Real usage and iOS are out of scope and stay reported as unanswered.
