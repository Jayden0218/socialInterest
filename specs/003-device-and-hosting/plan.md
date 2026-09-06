# Implementation Plan: Verified in the cloud, end to end

**Branch**: `003-device-and-hosting` | **Date**: 2026-09-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-device-and-hosting/spec.md`

## Summary

Six stories, all performable by the agent in CI at no cost. Three things get built:

1. **An Android runtime that reports why it failed.** Six previous attempts produced nothing
   but a boot timeout, because the runner action swallows the emulator's own output. The
   emulator is launched directly with its stdout and stderr redirected to a file that is
   uploaded whatever the outcome — so attempt seven is informative even if it fails.
2. **A stack that survives a restart.** Today the datastore runs `-inMemory`, object storage
   has no volume, and the event bus drops anything in flight when the process dies. Each is
   replaced with a durable equivalent and proved by writing, restarting everything, and
   reading back.
3. **A datastore decision, made before anything is built on it.** D3 is revisited with the
   migration cost counted from the 14 repository classes that would have to change, and with
   one consequence named explicitly: whether the chosen datastore can run *as itself* outside
   a deployment, which decides whether the load question is answerable at all.

Nothing here provisions a billable resource. Where an outcome cannot be reached — real usage,
iOS — it is reported unverified rather than substituted.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22; the existing pnpm workspace.

**Primary Dependencies**: Existing — NestJS, Playwright/Chromium, jest, Docker Compose, the
Android SDK command-line tools. Added: a Maestro-style flow driver is already present from
002 (`.maestro/`); an image-picker module is needed for Story 4.

**Storage**: DynamoDB Local (currently `-inMemory`), MinIO (currently volume-less). Both
change under Story 2. Whether DynamoDB remains the target at all is Story 3.

**Testing**: The existing suites — 448 API, 37 mobile, 39 e2e — plus a new Android journey run
and a restart-durability check. The browser journeys stay; Android is added alongside them.

**Target Platform**: Linux CI runner for the service and the emulator; Android 30+ for the app.

**Project Type**: Mobile app plus API service in one workspace.

**Performance Goals**: Story 5 only, and conditional. The 2026-09-05 measurement stands as
the baseline: generator 187,439 req/s, DynamoDB Local 827 req/s, application shape 5,574
req/s. Whether a better number is obtainable depends entirely on Story 3.

**Constraints**: No billable resources. No physical device. No human tester. Every Android
attempt must produce the runtime's own output. Anything requiring spend stops and reports.

**Scale/Scope**: One CI job for Android, one durable stack, one written decision, one
teardown query. No new product capability.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Assessment |
|---|---|
| **I. Interest Is the Organising Principle** (NON-NEGOTIABLE) | Not touched. No feed or follow behaviour changes. The Android journeys drive the same rules the browser journeys already assert, including the FR-033 negative case |
| **II. Visibility Is Decided Once** (NON-NEGOTIABLE) | Not touched, and explicitly guarded: FR-009 requires the visibility contract to pass in full against the durable stack, over every surface it covers today. No new read path is introduced — Android drives the existing ones |
| **III. Privacy Enforced Server-Side** | Strengthened. FR-007 requires the service to refuse development-secret tokens, which today it accepts. The hostile-client negative journeys continue to run over raw HTTP |
| **IV. Safety Ships With the Product** | Not weakened. Report and block are part of the Android journey set, so the safety surfaces gain device coverage rather than losing any |
| **V. Emulation Is Not Evidence** | **This feature is largely an application of it.** An emulator is still emulation, and FR-005 forbids inferring Android from the browser build while the spec keeps iOS reported unverified. Story 3 makes the principle operational for the datastore: a local stand-in and the real thing must not be conflated, which is exactly what FR-013 enforces on load measurements |

**No violations.** Principle V deserves a note rather than a justification: this feature adds
an Android *emulator*, which the principle warns about. It does not claim the emulator is a
device. It claims the emulator answers questions a browser cannot — native view layout, touch
dispatch, platform fonts and insets, real permission dialogs — and leaves everything only
hardware can answer reported unverified.

## Project Structure

### Documentation (this feature)

```text
specs/003-device-and-hosting/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── android-journey-run.md
│   └── durability-contract.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
.github/workflows/
├── ci.yml                      # unchanged
└── android-emulator.yml        # rewritten: direct launch, output always captured

scripts/
├── android-device-pass.sh      # extended: journeys, evidence
└── emulator-launch.sh          # NEW: launches the runtime, captures its output

.maestro/                       # journey flows, from 002
apps/
├── api/src/
│   ├── adapters/local/
│   │   ├── in-process-event-bus.ts   # replaced by a durable bus
│   │   └── local-identity-provider.ts # dev-secret refusal
│   └── persistence/            # 14 repositories — the D3 migration surface
├── mobile/src/
│   ├── features/publish/       # MediaPickerScreen, currently unmounted
│   └── screens/index.tsx       # container wiring
└── e2e/                        # browser journeys stay; durability check added

docker-compose.yml              # durable datastore and object storage
infra/scripts/verify-teardown.ts # the unwritten resource query
```

**Structure Decision**: No new packages. This feature changes how existing things are run and
verified, not what the product is. The only new files are a launcher script and the Phase 1
documents; everything else is an edit to something that already exists.

## Complexity Tracking

> No constitution violations. Section retained empty deliberately.

## Risk this plan is designed around

The dominant risk is not technical, it is behavioural, and this session demonstrated it six
times: **iterating on an invisible failure.** Every emulator hypothesis so far — the readiness
probe, the heavy image, the accel check, the options override, the runner image — was a guess
about a process whose output nobody had read, and one of them was asserted confidently in
project documentation and later had to be retracted.

The plan's first task is therefore not "make the emulator boot". It is "make the emulator's
failure visible", and every subsequent Android task depends on it. If attempt seven fails with
its output captured, that is a successful task: it produces the evidence FR-004 requires and
ends the guessing.
