---

description: "Task list for 009 — Disposable Session Server"
---

# Tasks: Disposable Session Server

**Input**: Design documents from `specs/009-session-server/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: **Included, and not optional here.** The constitution's *Development Workflow and
Quality Gates* requires that where a document declares itself a contract, the test enforcing
it exists before the implementations it governs. Both documents in `contracts/` declare
themselves contracts, so their enforcing tests are Phase 2 work.

**Organization**: By user story, so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete work)
- **[Story]**: US1 / US2 / US3, mapping to spec.md
- Every task names its file

---

## A note on "verified RED", because the two contracts differ

This repository's rule is that *a guard that passes is not a guard until you have watched it
fail*. Two of the guards below cannot be watched failing the same way, and pretending
otherwise is how a vacuous test gets committed:

- **`contracts/backend-address.md` is genuinely test-first.** The code it governs exists
  (`token-store.ts`, `data-provider.tsx`, `SignInContainer`), the *behaviour* does not. Its
  tests go red against the shipped product, for the product's reason.
- **`contracts/session-descriptor.md`'s ordering clause cannot be.** Its subject is a script
  that does not exist yet, so a test written first is red because a file is missing — which
  proves nothing. It is therefore built first and then **verified red by deliberately
  violating the order** (T021), which is the only red that means anything here.

`hooks-before-return.test.ts` is the cautionary tale this note exists for: it lost its
subject when files moved, found zero offenders in an empty list, and went green in the same
run that reported 253 tests passing.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: The one new dependency, and the native regeneration it forces.

- [ ] T001 Read `node_modules/expo/bundledNativeModules.json` and record the version it names for `@react-native-async-storage/async-storage` in `specs/009-session-server/research.md` under R4
- [ ] T002 Add `@react-native-async-storage/async-storage` to `apps/mobile/package.json` at exactly that version — **never a version pnpm chooses**; `expo install` cannot reach its API from this sandbox and `pnpm add` picking its own version is what killed the app at module registration with `NoClassDefFoundError: AnyTypeCache`
- [ ] T003 Regenerate the Android project with `expo prebuild --platform android --no-install` in `apps/mobile/` so the new native module is linked

**Checkpoint**: The dependency exists and the native project knows about it. Nothing works yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Capture the gate baselines this feature promises not to move, and write the
contract test that *can* be written first.

**⚠️ CRITICAL**: No user story work begins until T004–T006 are done.

- [ ] T004 Record the gate baselines by running `pnpm --filter @sih/api test:visibility` and `pnpm --filter @sih/api test:integration`, capturing `BASE_SURFACES.length` (16, `apps/api/tests/visibility/matrix.spec.ts:476`), `baseTotal` (1488, `:532`) and the public-route snapshot from `apps/api/tests/integration/auth-surface.spec.ts` into `specs/009-session-server/quickstart.md`
- [ ] T005 [P] Write the enforcing test for `contracts/backend-address.md` §1–§4 in `apps/mobile/src/data/__tests__/settings-store.test.ts` — resolution order, persistence, same-address-is-not-a-change, storage failure falls back rather than throws
- [ ] T006 [P] Write the structural test for `contracts/backend-address.md` §6 in `apps/mobile/__tests__/address-is-not-a-permission.test.ts` — no module that renders or gates content may read the stored address; reuse the comment-stripping import scanner in `apps/api/tests/unit/support/forbidden-imports.ts` rather than writing a fourth copy
- [ ] T007 Watch T005 and T006 fail against the shipped product and record what each said in `specs/009-session-server/checklists/requirements.md` — a red for "the file does not exist" is not the red this asks for

**Checkpoint**: Baselines recorded, contract tests red for the product's own reasons.

---

## Phase 3: User Story 1 — Point the app at a backend without reinstalling (Priority: P1) 🎯 MVP

**Goal**: One installed app, any backend address, persisted across restarts.

**Independent Test**: Install once. Point at backend A, sign in. Point the same install at
backend B, sign in. No reinstall. Valuable with none of US2 built — any reachable backend
will do.

### Implementation for User Story 1

- [ ] T008 [US1] Add a device backing store for `KeyValueStore` in `apps/mobile/src/data/token-store.ts`, beside `browserKeyValueStore()` and behind the same interface — this is the missing half that makes the app sign out on every relaunch (research R4)
- [ ] T009 [US1] Create `apps/mobile/src/data/settings-store.ts` holding `sih.backend.url`: resolution order (stored → built-in default, **two levels, no environment override**), persistence, and a read that falls back rather than throws
- [ ] T010 [US1] Implement the invalidation rule in `settings-store.ts` in **one place** — writing a *different* address clears `sih.auth.token`; writing the *same* address does not (contract §3, FR-005)
- [ ] T011 [US1] Update `apps/mobile/src/data-provider.tsx` to select the device store off the web and keep `browserKeyValueStore()` on it, so `apps/e2e/browser/authenticated.spec.ts` still authenticates through the same key
- [ ] T012 [US1] Make `baseUrl` loaded state in `apps/mobile/src/App.tsx` instead of the module constant `API_BASE_URL`, feeding `<DataProvider baseUrl={...}>` — **every hook before every return**, per `apps/mobile/__tests__/hooks-before-return.test.ts`
- [ ] T013 [US1] Add the address field to `apps/mobile/src/features/auth/SignInScreen.tsx` with the submit control **above both fields** — ordering, not a measured gap (contract §5, FR-006)
- [ ] T014 [US1] Wire address and credential in `apps/mobile/src/screens/SignInContainer.tsx` — hooks before returns applies here too
- [ ] T015 [US1] Make an unreachable address or a rejected credential report itself rather than render as an empty state, in `SignInContainer.tsx` and the containers behind it (contract §4, FR-004)

### Verification for User Story 1

- [ ] T016 [US1] Re-run T005 and T006 and watch them go green for the right reason
- [ ] T017 [US1] Measure the sign-in fold with two fields in `apps/e2e/browser/signin-fit.spec.ts` — assert the **ordering** (submit above both fields), and record the measured numbers as consequence rather than as the assertion
- [ ] T018 [US1] Add the address field's testID and reconcile `.maestro/` flows that type a token, then run `node scripts/verify-maestro-ids.mjs` — a pattern may not also match a declared literal, and a plain string under a dynamic prefix must resolve
- [ ] T019 [US1] Run `pnpm --filter @sih/mobile test`, `pnpm lint`, `pnpm typecheck` and confirm the standing guards are green: `hooks-before-return`, `screen-scrolls`, touch targets, `text-has-colour`, `no-hardcoded-style`

**Checkpoint**: US1 is complete and shippable on its own. The app talks to any address and
remembers it — and the pre-existing sign-out-on-relaunch defect is gone with it.

---

## Phase 4: User Story 2 — Start a temporary backend on demand, for free (Priority: P2)

**Goal**: A dispatchable session, reachable from anywhere, costing nothing.

**Independent Test**: From a cold state with no account and no payment method, start a
session and reach its address from a phone on an unrelated network.

### Implementation for User Story 2

- [ ] T020 [US2] Create `scripts/session-up.sh` implementing the fixed bring-up order from `contracts/session-descriptor.md` §1 — backing services, media tunnel, **then** the API with `S3_PUBLIC_ENDPOINT` set to the media address, then the API tunnel. Reuse the readiness wait and seed sequence already proven in `.github/workflows/android-emulator.yml`
- [ ] T021 [US2] Implement the ordering check inside `scripts/session-up.sh`: before emitting a descriptor, verify a presigned URL issued by the running API is addressed to the captured media address; fail and name step 3 if not. **Then verify it RED** by starting the API before the tunnel, and record what it said — this is the only meaningful red for this guard
- [ ] T022 [US2] Install a **pinned** `cloudflared` version in `scripts/session-up.sh` and open two quick tunnels, capturing both addresses by parsing the client's own output — a floating version puts the ability to start a session outside this repository's control (research R2)
- [ ] T023 [US2] Generate a per-session `LOCAL_JWT_SECRET` in `scripts/session-up.sh` and seed via `pnpm --filter @sih/infra db:create-local`, `s3:create-local`, `seed:catalogue` (FR-013, FR-015)
- [ ] T024 [US2] Mint at least one credential through `apps/api/scripts/mint-device-token.ts` — **not** a hand-rolled JWT; a signed token whose profile row does not exist gets `404 No such person` and sign-in fails on the device (contract §2, FR-014)
- [ ] T025 [US2] Create `.github/workflows/session-server.yml` as `workflow_dispatch` with a `lifetime` input defaulting to **2 hours** and capped at the platform's hard 6, calling `scripts/session-up.sh` and keeping the YAML thin
- [ ] T026 [US2] Implement lifetime enforcement and teardown in `session-server.yml` — the job ends itself at the stated expiry (FR-016), and bounds the bring-up with a timeout so a wedge costs one step rather than the whole job
- [ ] T027 [US2] Make every failure path in `scripts/session-up.sh` name its step **at the moment it fails**, not at the end of the job — run 56's evidence lived after a loop that was killed first and printed nothing at all (FR-021, research R8)

**Checkpoint**: A session can be started and reached. US1 + US2 together are the working
product on a phone.

---

## Phase 5: User Story 3 — Get the address and credential without hunting (Priority: P3)

**Goal**: Everything the owner must type is in front of them, on a phone.

**Independent Test**: Start a session using only a phone; obtain both addresses and the
credential there, without a laptop and without downloading a file.

- [ ] T028 [US3] Write the descriptor to `$GITHUB_STEP_SUMMARY` in `scripts/session-up.sh` **at the moment its contents are known**, not accumulated for the end — job logs come back only as a tail and the artifact host is denied by this environment's egress (contract §3, research R8)
- [ ] T029 [US3] Include an **absolute** expiry time and the lifetime as chosen in the descriptor — "2 hours" read forty minutes later is a lie (contract §2, FR-017)
- [ ] T030 [US3] Make a running session observable through the existing public health endpoint in `apps/api/src/modules/health/health.controller.ts` — add nothing new (contract §5, FR-022)

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish, Verification & Cross-Cutting

**Purpose**: Build it, run it, and report it honestly.

- [ ] T031 [P] Build the arm64 release APK per `docs/verification/tier-b-runbook.md` and hand it to the owner — with the address now runtime-settable, **this build is not tied to any backend** and does not need rebuilding per session
- [ ] T032 **Dispatch the first session. This is the experiment, not a validation.** Research R2 records the tunnel as unverified on a runner; if it fails, fall back through the providers R2 names in order and record which worked
- [ ] T033 Run the device pass on the owner's phone per [quickstart.md](./quickstart.md) sections B–D, publishing a post carrying a photograph and confirming it renders
- [ ] T034 Re-run the gates from T004 and confirm `BASE_SURFACES` is still 16, `baseTotal` still 1488, and the public-route snapshot unchanged — if either moved, this feature added a visibility surface and the design is wrong
- [ ] T035 [P] **Grep the copy, not only the code**: confirm no user-facing string, workflow name, or document produced by this feature describes a session as a deployment or as publicly available (FR-019). 007 shipped a follow hint describing a withdrawn requirement because only the code was updated
- [ ] T036 [P] Add the Principle V divergence entry for the session environment in `docs/verification/divergence-register.md` and confirm `pnpm verify:register` passes
- [ ] T037 Record the run in `docs/verification/runs/` with every criterion marked pass, fail or **not run** — never blank, and **count the items rather than reading the highest number**, which this project has got wrong twice
- [ ] T038 Update `CLAUDE.md` honestly: the app runs on a real phone, and this does **not** close the hosting question or `003/datastore-decision.md`
- [ ] T039 Walk [quickstart.md](./quickstart.md) end to end as written, and fix the document wherever reality disagreed with it

---

## Success criteria → the task that measures each

The constitution requires that a stated criterion has a task which measures it. A criterion
with an implementation and no measurement is not met, it is attempted.

| Criterion | Measured by | Instrument |
|---|---|---|
| SC-001 — usable address + credential in under 10 min | T032 | The dispatched run's own timings |
| SC-002 — one install, three addresses, three days | T033, then twice more | The phone |
| SC-003 — full path on an unrelated network | T033 | **The phone. Nothing else can.** |
| SC-004 — zero blank media | T021 (prevents), T033 (observes) | The bring-up check, then the phone |
| SC-005 — ends within 5 min of expiry | T026, T032 | The run's end time against the stated expiry |
| SC-006 — every failure names its step | T027, T032 | Observed on any failing dispatch |
| SC-007 — zero cost, zero payment methods | T032 | Inspection: none on file |
| SC-008 — re-point and sign in under 2 min | T033 | The phone, timed |

**SC-003 and SC-004 are the owner's to observe.** Everything up to pressing dispatch can be
built and checked here; those two cannot be, and must be reported `not run` until they are.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001–T003)**: no dependencies
- **Foundational (T004–T007)**: needs Setup; **blocks all stories**
- **US1 (T008–T019)**: needs Foundational. Independent of US2 and US3
- **US2 (T020–T027)**: needs Foundational. Independent of US1 — the session can be built and
  dispatched before the app can point at it, and is worth doing in that order if R2 turns out
  to be wrong, because that is the finding that changes the plan
- **US3 (T028–T030)**: needs US2's script to exist (T020). Touches the same file, so **not
  parallel with US2**
- **Polish (T031–T039)**: needs US1 and US2. T033 needs T031 and T032

### Story dependencies

- **US1** stands alone. Ship it alone if you want the MVP.
- **US2** stands alone but is only *useful* with US1 — without it, every session needs a
  fresh APK.
- **US3** extends US2 and shares its file.

### Parallel opportunities

- T005 and T006 — different files, both red-first
- **US1 and US2 are genuinely parallel**: entirely different trees (`apps/mobile/` versus
  `scripts/` and `.github/workflows/`). Two agents would not collide
- T031, T035 and T036 — different files
- **Not parallel**: T020, T021, T022, T023, T027, T028, T029 all edit `scripts/session-up.sh`.
  Single-owner file, same rule `CLAUDE.md` records for `matrix.spec.ts` and `ci.yml`

---

## Implementation Strategy

**MVP is US1 alone** — and unusually, it is worth shipping alone even if US2 never happens.
It makes one APK work against any backend forever and fixes a defect that has been in the
app since token persistence was added.

**Then US2**, which is where the unknown lives. If the tunnel does not work on a runner, that
is discovered at T032 and costs one dispatch. Nothing in US1 is wasted by that outcome, which
is the main argument for this ordering.

**US3 last**, because a session whose descriptor is awkward to read is still a working
session, and one that cannot start is not.

**Do not report this feature complete before T032 and T033.** The plan's Principle V gate
forbids stating that the session server works until a dispatched run has been observed end to
end. "It should work" is not a result.
