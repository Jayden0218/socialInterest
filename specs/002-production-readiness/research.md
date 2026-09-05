# Research: Production Readiness

**Feature**: 002-production-readiness | **Date**: 2026-09-05

Six decisions. R1 is the one most likely to be misread later, so it is first and longest.

---

## R1 — The current SC-011 number is not measuring what it appears to measure

**Decision**: Before changing the feed design, establish *what is saturating*. Rework
`bench:feed-load` to drive the API over HTTP, and add `ceiling.bench.ts` which measures three
ceilings separately: the load generator's own, the application's with the datastore replaced by
a fixed-latency stub, and DynamoDB Local's in isolation. Only if the application ceiling is the
binding one does the feed design change.

**Rationale**: The published figure — p95 11.8s at 100 concurrent — came from a harness that:

- calls `feed.homeFeed()` **in-process**, so no HTTP layer, no server concurrency model, no
  serialisation, and no connection pool is exercised;
- issues its "concurrency" as `Promise.all` from **one Node event loop**, so 100 concurrent
  requests are 100 interleaved continuations on a single core;
- runs against **DynamoDB Local**, a single Java process with no partitioning, no request
  router, and none of provisioned DynamoDB's horizontal behaviour.

Each of those three could produce a rising p95 curve on its own. The reported number is
consistent with the design being at fault and equally consistent with the design being fine and
the emulator being a single-threaded wall. Feature 001's own record says the coupling is real
and the numbers are not a production prediction — that is correct, and it is also not yet
actionable. Changing the architecture on this evidence would be guessing at some expense.

**What this changes about the 001 finding**: nothing is retracted. Read-time fan-in does
multiply concurrency by follow count at the datastore; that is arithmetic. What is not
established is whether the *observed* ceiling is that arithmetic or the emulator. This is a
measurement-validity problem (FR-012), and it is cheap to resolve.

**Alternatives considered**:

- *Adopt the D1 hybrid immediately.* Rejected: it is a significant change to the read path,
  it is the thing most likely to endanger Principle II, and it would be adopted on evidence
  that cannot distinguish the design from the emulator.
- *Re-measure on provisioned DynamoDB first.* Rejected as the **first** step only: it costs
  money and needs approval, and it would still not separate the application's ceiling from the
  datastore's. Attribute locally first, then — if warranted — spend once, with a specific
  question to answer.
- *Declare the number an emulator artifact and move on.* Rejected: that is the same
  unevidenced leap in the opposite direction, and it is the more dangerous one because it ends
  the investigation.

---

## R2 — Two tiers of end-to-end, because the sandbox has no inbound route

**Decision**:

- **Tier A (automated, every change, no cloud):** `apps/e2e` drives the mobile app's real data
  layer and the real generated client over real HTTP to a real API process, backed by real
  DynamoDB Local and MinIO. Runs in CI. This is what catches contract drift.
- **Tier B (manual, pre-release):** the full app on a physical device of each platform against
  an API on the same LAN, run on a developer machine. Recorded as a Journey Run.

**Rationale**: The cloud sandbox has no public inbound route, so a simulator or phone cannot
reach an API running there — this is a documented, unfixable property of the environment, not a
setup problem. Splitting the tiers means the part that catches most defects (request/response
shape, auth, pagination, error mapping) runs constantly and cheaply, while the part that needs
real hardware (permissions, camera, photo library, background suspension, real network) runs
where hardware exists.

Tier A deliberately drives the **data layer**, not the rendered UI, because a UI driver adds a
second source of flakiness to a suite whose job is to detect contract drift. Screen behaviour
is already covered by the 31 render tests.

It must be the *app's* data layer, not the generated client directly. Both the client and the
API's contract tests are generated from one OpenAPI document, so they agree with each other by
construction — driving the client alone would produce a green suite that says nothing about the
app's own request construction, which is the failure mode 001 already demonstrated. The negative
journeys N-01 to N-04 are the deliberate exception: they bypass the data layer and issue raw
requests, because their purpose is to exercise the path a hostile client would take.

**Alternatives considered**:

- *Detox / Maestro UI automation in CI.* Rejected for now: needs a simulator the sandbox cannot
  host, and would make contract drift and UI flake indistinguishable in the same red build.
- *Contract tests alone, generated from OpenAPI on both sides.* Rejected: both sides generated
  from one document agree with each other by construction, which is exactly the failure mode
  001 already hit — a green suite proving nothing about the running system.

---

## R3 — Contract drift must fail the build, not a review

**Decision**: Regenerate the client from `contracts/openapi.yaml` in CI and fail if it differs
from the committed `packages/shared/src/client/operations.generated.ts`. Tier A then exercises
the regenerated client against the running API.

**Rationale**: FR-003 requires disagreement to surface at build time. A generated file that is
committed but never re-verified silently becomes fiction the moment the document changes. The
diff check is cheap and total.

**Alternatives considered**: generating at build time instead of committing — rejected because
the committed artifact is what the mobile typecheck reads, and losing it would make mobile
builds depend on a code-generation step the app does not otherwise need.

---

## R4 — The divergence register is the Principle V artifact, and completeness is its only hard property

**Decision**: Maintain `docs/verification/divergence-register.md`. One entry per capability
where the local stand-in and the production service are different implementations. Today that
is exactly four — and, checked against the code rather than the file list, only one of them has
a production implementation to verify at all:

| # | Capability | Local | Production | Implementation | Why it can differ |
|---|---|---|---|---|---|
| D-1 | Object store | MinIO | S3 | **real** — uses `@aws-sdk/client-s3`, never executed | Presign semantics, consistency, error taxonomy |
| D-2 | Transcode | ffmpeg container | MediaConvert | **stub** — all three methods throw `NOT_PROVISIONED` | Queueing and job latency — directly gates 002/SC-005 |
| D-3 | Identity | local JWT issuer | Cognito | **stub** — `verify()` throws | Token shape, claims, expiry, refresh |
| D-4 | Media delivery | direct MinIO read | CDN | **absent** — no adapter file exists | Signed-URL scope and expiry, cache behaviour, whether an unauthorised viewer can fetch |

This is why the register carries an `implementation` field (FR-031) and why US3 is
implementation *then* verification. Reporting D-2, D-3 and D-4 as merely "unverified" would
suggest code exists that could be run. It does not. Writing that code is unbudgeted work that
needs no approval; only running it against real infrastructure is gated.

DynamoDB is deliberately **absent**: DynamoDB Local speaks the same API, so per Principle V's
second clause no divergence exists and no adapter should be invented. This is consistent with
001's D9.

Each entry carries what would count as proof. A capability added without a register entry is an
incomplete change (FR-014) — enforced by a check that fails when `adapters/aws/` gains a file
with no corresponding register entry.

**Rationale**: The register is what stops Principle V from degrading into a slogan. The
enforcement matters more than the content: a register that is merely maintained by intention is
the same failure as a test suite that is merely believed to pass.

**Alternatives considered**: tracking divergences as issues — rejected, they close and disappear;
the register must reflect current state, not history.

---

## R5 — Real-usage outcomes: aggregate-only, suppression floor, and misses reported

**Decision**: A report job in `apps/workers/src/reports/` derives each outcome from data the
product already records, and emits aggregates only, suppressing any cell below 20 people. The
moderation outcome is computed from the append-only moderation log and counts reports with no
decision as **missed**. Where a window closes with fewer than 50 participants or shorter than 14
days, the report states the figure is not meaningful instead of publishing it.

**Rationale**: FR-028 and FR-029 make this a privacy surface, not just a reporting one — the
constitution's Principle III posture applies to what the team learns about people as much as to
what other users can see. The suppression floor and the aggregate-only rule are the enforcement.
Counting undecided reports as misses (FR-027) is the difference between a measure and a
flattering one; the natural implementation — averaging decision times over decided reports —
would report the best number precisely when moderation is failing worst.

**Alternatives considered**: per-user event export for flexibility — rejected outright, it makes
every future question a privacy decision instead of settling it once.

---

## R6 — Cost control: approval per run, tagging, and teardown confirmed from outside

**Decision**: Every Verification Run records the approval it ran under, a spend ceiling, and a
resource tag. `infra/scripts/verify-teardown.ts` lists resources by that tag and fails if any
survive — run as a **separate invocation**, not in the `finally` block of the script that
created them.

**Rationale**: The spec's edge case is the real one: the container or session dies between
provisioning and teardown, and nothing is left watching. A teardown that depends on the
creating process surviving is not a teardown. This session's own environment is ephemeral by
design, which makes the failure mode likely rather than theoretical.

**Alternatives considered**: relying on the IaC tool's destroy command alone — rejected as
insufficient on its own; it is the mechanism, but the confirmation must come from an
independent query, because the failure being guarded against is the destroy never running.

---

## Resolved: the open clarification from spec.md FR-020

**Question**: is provisioning a paid verification environment in scope for this feature?

**Decision — staged, and the owner's approval is still required to start C or D.** This feature
delivers Phases A and B (US1, US2) with **zero spend**, and takes Phases C and D (US3, US4) to
the point of being executable — register written, runbooks written, teardown and spend checks
built and testable against a dry run — and then stops.

**Rationale**: this is the only reading consistent with the constitution's standing instruction
that no task provisions billable resources without explicit, specific approval, and it has the
property that the answer to the cost question does not invalidate any work done before it is
asked. It also front-loads the discovery that matters most: R1 may show that SC-011's ceiling
is the emulator, which changes what a paid measurement should even be asked to answer.

**This is not a substitute for the owner's decision.** It is the plan for how to be ready for
either answer. The specific approval to spend must still be sought before Phase C begins, and
again for Phase D.
