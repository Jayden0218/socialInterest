# Implementation Plan: Production Readiness — Close the Evidence and Scale Gaps

**Branch**: `claude/spec-kit-integration-juhrza` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-production-readiness/spec.md`

## Summary

Feature 001 shipped 172 tasks and a green suite. This feature converts four unproven or
false claims into evidence:

1. **The app has never spoken to the service.** `apps/mobile` imports only *types* from
   `@sih/shared` — not the generated client, not a single request. Wire a real data layer,
   then drive the core journeys over real HTTP against a real API on every change.
2. **SC-011 is failing, but the current number does not mean what it appears to.**
   `bench:feed-load` calls `feed.homeFeed()` in-process from one Node event loop against
   single-process DynamoDB Local. It measures neither the HTTP layer nor a production
   datastore. Establish what is actually saturating before changing the design.
3. **The `aws` adapters mostly do not exist.** Checking the code rather than trusting the
   file list: `s3-object-store.ts` is a real implementation that has never executed;
   `mediaconvert-media-processor.ts` throws `NOT_PROVISIONED` from all three methods;
   `cognito-identity-provider.ts` throws from `verify()`; and there is **no media-delivery
   adapter at all**. So US3 is implementation *then* verification for three of its four
   entries. Writing that code costs nothing and is not gated; only running it against real
   infrastructure is.
4. **Five outcomes are instrumented but unmeasurable.** Define population, window, and an
   aggregate report that states misses rather than omitting them.

**Cost posture is unchanged and load-bearing here.** US1 and US2 require no cloud account and
proceed immediately. US3 and US4 are planned to the point of being executable and then stop,
gated on the owner's explicit approval.

## Technical Context

**Language/Version**: TypeScript 5.7, Node 22

**Primary Dependencies**: NestJS (API), Expo / React Native 0.81 (mobile), AWS SDK v3 clients,
jest + ts-jest, `@testing-library/react-native`, tsx as the production runner

**Storage**: DynamoDB single-table (`sih-main`, 4 GSIs) via DynamoDB Local; MinIO for media

**Testing**: jest (4 projects: unit, contract, visibility, integration), `smoke:boot` under the
production runner, four benches under `apps/api/bench/`

**Target Platform**: iOS and Android via Expo dev builds; API on Node 22 in a container

**Project Type**: Mobile client + HTTP API + async workers + IaC, pnpm workspace monorepo

**Performance Goals**: feed and interest-space first content within 2s at p95, sustained while
10,000 people browse concurrently (carried unchanged from 001 SC-005 / SC-011)

**Constraints**:
- No billable resource without explicit, specific approval (constitution, Cost and Environment
  Constraints). Binding on US3 and US4.
- CI must run the full suite with no cloud credentials.
- The cloud sandbox has **no public inbound route** — a phone or simulator cannot reach an API
  running there. This splits US1 into an automated tier and a developer-machine tier.
- Visibility must remain decided once, and take effect immediately on every surface. This
  constrains every option available for SC-002.

**Scale/Scope**: 10,000 concurrent readers; 200-follow cap per person; ~26k lines across five
packages today

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design.*

| Principle | Engaged? | Result |
|---|---|---|
| I. Interest Is the Organising Principle (NON-NEGOTIABLE) | Yes — US2 changes the feed read path | **PASS with a standing gate.** Any change to reach SC-002 re-runs the follow-expansion tests that assert a person-follow does not widen the feed (FR-033 of 001). No optimisation may introduce a source of posts outside followed interests. |
| II. Visibility Is Decided Once (NON-NEGOTIABLE) | Yes — heavily | **PASS, conditionally.** The principle forbids designs requiring visibility to be re-applied to stored copies. The D1 hybrid is admissible **only** in the form where materialised state holds *candidate references* and `VisibilityFilter` still runs at read time on every candidate. Materialising a *rendered, viewer-specific* timeline is forbidden and is not planned. FR-007 and FR-010 encode this; SC-003 of this feature is the gate. |
| III. Privacy Guarantees Are Enforced Server-Side | Yes | **PASS.** FR-017 requires the production-path metadata-strip check to be driven through the hostile-client path, matching how 001 tests it locally. |
| IV. Safety Ships With the Product | Yes | **PASS.** Safety journeys (report, block) are in the US1 core set, and FR-027 makes the moderation measure count undecided reports as misses. |
| V. Emulation Is Not Evidence | Yes — this feature is its follow-through | **PASS.** US3 exists to discharge the "stated plan to verify the production path before launch" that Principle V requires. The divergence register (FR-013, FR-014) is the artifact that keeps it complete. |
| Cost and Environment Constraints | Yes | **PASS, with one apparent conflict resolved below.** |
| Development Workflow and Quality Gates | Yes | **PASS.** Contract-defining tests precede implementation: the OpenAPI drift check and the visibility matrix both gate the code they govern. "Measured, not asserted" is the whole point of this feature. |

### Apparent conflict, resolved: cloud-free CI vs. production-path verification

The constitution says *"Continuous integration MUST run the full test suite without cloud
credentials. A test that cannot run in CI for want of a cloud account is not a test the project
relies on."* US3 requires a cloud account. This looks like a violation and is not:

**Production-path verifications are not tests and are not part of the suite.** They are
Verification Runs — dated, versioned, approved, manually initiated records of evidence, per
Principle V's requirement for "a stated plan to verify the production path before launch."
CI continues to run the entire jest suite, `smoke:boot`, and every bench with no credentials.
Nothing in CI gains a cloud dependency under this plan. A Verification Run's *result* is
consumed by a release gate (FR-015), not by a build.

This distinction is recorded because a future reader will otherwise reasonably conclude the two
rules contradict each other.

### Standing gate on US2

No change to the feed read path is accepted until `pnpm --filter @sih/api test:visibility`
passes at full coverage — all 7 states × 6 viewers × 7 surfaces, 294 assertions, with no
surface or state removed. A performance change that reduces matrix coverage is rejected
regardless of the latency it achieves.

## Project Structure

### Documentation (this feature)

```text
specs/002-production-readiness/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output — 6 decisions (R1-R6)
├── data-model.md        # Phase 1 output — 6 records, no new persisted entities
├── quickstart.md        # Phase 1 output — how to run each verification
├── contracts/
│   ├── divergence-register.md    # The Principle V contract: format + completeness rule
│   ├── e2e-journeys.md           # The core journey set US1 must cover
│   └── outcome-report.md         # Shape and privacy rules of the usage report
├── checklists/
│   └── requirements.md
└── tasks.md             # Created by /speckit-tasks, not by this command
```

### Source Code (repository root)

```text
apps/
├── api/
│   ├── bench/
│   │   ├── feed-load.bench.ts        # CHANGED: drive over HTTP, not in-process
│   │   ├── ceiling.bench.ts          # NEW: isolates harness / app / datastore ceilings
│   │   └── harness.ts                # CHANGED: concurrency model, saturation reporting
│   ├── src/
│   │   ├── adapters/aws/             # EXISTING, never executed - US3 subject
│   │   ├── modules/feed/             # CHANGED only if R1 shows the design is the ceiling
│   │   └── visibility/               # UNCHANGED - the gate, not the subject
│   └── tests/visibility/matrix.spec.ts   # UNCHANGED, run as the US2 gate
├── mobile/
│   └── src/
│       ├── data/                     # NEW: the missing layer - real client, real requests
│       └── features/                 # CHANGED: screens consume data/ instead of props only
├── e2e/                              # NEW package: journeys over HTTP against a live API
│   ├── journeys/
│   └── support/
└── workers/
    └── src/reports/                  # NEW: aggregate outcome report (US4)

infra/
└── scripts/
    ├── verify-teardown.ts            # NEW: confirms destruction independently (FR-021)
    └── spend-report.ts               # NEW: records cost per verification (FR-022)

docs/
└── verification/
    ├── divergence-register.md        # NEW: the live register (US3)
    └── runs/                         # NEW: one Verification Run record per execution
```

**Structure Decision**: The existing pnpm workspace is kept. One new package, `apps/e2e`, is
added because the end-to-end journeys belong to neither `apps/api` nor `apps/mobile` — they
require both to be running and must fail if either drifts. Putting them inside either package
would make one of the two the owner of a contract it does not solely control. `docs/verification/`
is new because Verification Runs are durable records, not test output, and must outlive the
container that produced them.

## Phased Delivery and the Cost Gate

| Phase | Stories | Needs approval? | Can run in CI? |
|---|---|---|---|
| A | US1 — end-to-end client ↔ service | No | Yes |
| B | US2 — feed latency under concurrency | No for local attribution; **yes** for the production-shaped run (FR-008) | Yes, except that run |
| C | US3 — production-path verification | **Yes, per verification** | No, by design (see above) |
| D | US4 — real-usage measurement | **Yes** (needs a deployment and participants) | Report generation only |

Phases A and B are complete work in their own right: at the end of B the product is
demonstrably functional end to end and the feed's ceiling is correctly attributed. Note that
B cannot *close* SC-002 without approval: FR-008 requires a production-shaped datastore, so the
free part of B establishes attribution and the 10,000 figure stays unverified until that one
gated run happens. Nothing in C or D is started without a separate,
specific approval.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| New workspace package `apps/e2e` | The journeys span the mobile data layer and the API and must fail on drift in either | Housing them in `apps/api/tests` makes the API the owner of a contract the mobile app half-controls, and hides mobile-side breakage behind an API-package test run |
| New `docs/verification/` tree outside `specs/` | Verification Runs are dated evidence about a specific version, consumed by a release gate | Keeping them in `specs/` conflates the design record (what we intend) with the evidence record (what we observed), and 001 already showed how easily intent gets read as evidence |

## Constitution Check — re-evaluated after Phase 1 design

*Required by the constitution's Compliance Review clause. Re-run against the design artifacts,
not against the intent.*

| Principle | Post-design result |
|---|---|
| I. Interest Is the Organising Principle | **PASS.** J-06 in the journeys contract asserts the home feed returns only followed-interest posts, over HTTP against the real service — the first time this is checked outside a unit test. The conditional materialised index in data-model.md carries the constraint with it. |
| II. Visibility Is Decided Once | **PASS.** Three independent enforcements now exist: the 294-assertion matrix as a standing gate on any US2 change; negative journeys N-02, N-03, N-04 exercising the guarantee over real HTTP; and the explicit prohibition in data-model.md on materialising a rendered or viewer-specific timeline. |
| III. Privacy Guarantees Are Enforced Server-Side | **PASS.** N-04 requests media directly, as a hostile client would, and FR-017 repeats that check on the production delivery path. The outcome report contract extends the same posture to what the *team* learns: aggregates only, 20-person suppression floor. |
| IV. Safety Ships With the Product | **PASS.** J-09 and J-10 put report and block in the core journey set, so a release cannot pass Tier A with safety broken. FR-027 stops the moderation measure from flattering itself. |
| V. Emulation Is Not Evidence | **PASS.** The divergence register has a mechanical completeness check rather than a review convention, and `verified` decays to `stale` when the version moves on. R1 applies the same principle reflexively: it refuses to treat an emulator measurement as evidence about the design. |
| Cost and Environment Constraints | **PASS.** Phases A and B add nothing billable. Phase C's teardown confirmation is an independent invocation, guarding the failure mode this environment makes likely. The cloud-free-CI tension is resolved above: Verification Runs are evidence records, not suite members. |
| Development Workflow and Quality Gates | **PASS.** Three contracts precede their implementations. "Measured, not asserted" is enforced by the rule that a Load Measurement without a bottleneck attribution may not be cited as evidence about the design. |

**No violations requiring justification.** The two entries in Complexity Tracking are structural
choices, not principle violations.

**One correction carried forward from 001.** Its record states the SC-011 measurement showed
read-time assembly "over budget under concurrency". That is what was measured, but the harness
was in-process on a single event loop against single-process DynamoDB Local, so it cannot
distinguish the design from the emulator. R1 does not retract the concern — it makes it
answerable. Any future reader citing the 11.8s figure as evidence about the architecture should
read [research.md](./research.md#r1) first.
