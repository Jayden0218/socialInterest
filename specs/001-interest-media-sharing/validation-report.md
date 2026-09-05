# Validation Report

**Feature**: `specs/001-interest-media-sharing`
**Date**: 2026-09-05
**Profile**: `local` — Docker only, no AWS account, no credentials, no cost
**Tasks**: 172 of 172 complete

Produced by running [`quickstart.md`](./quickstart.md) end to end (T171).

## Results

| Check | Command | Result |
|---|---|---|
| Typecheck, 6 packages | `pnpm -r typecheck` | **PASS** |
| Full test suite | `pnpm test` | **PASS** — 447 tests, 24 suites |
| SC-009 visibility matrix | `pnpm --filter @sih/api test:visibility` | **PASS** — 294/294, 7/7 surfaces |
| Local profile dependencies | `pnpm --filter @sih/infra verify:local` | **PASS** — 4/4 |
| Production-runner boot | `pnpm --filter @sih/api smoke:boot` | **PASS** — 9/9 routes |
| Stack matches data model | `pnpm --filter @sih/infra verify:stack` | **PASS** — 4 GSIs, ttl, stream |
| Synth, no account | `pnpm --filter @sih/infra synth` | **PASS** |
| Catalogue seed idempotency | run 3× | **PASS** — 12 interests, no duplication |
| API serves | `GET /v1/health` | **PASS** — 34 routes registered |

### verify:local detail

Asserts the four things the local profile rests on:

- `TransactWriteItems` — the FR-017 atomic visibility flip
- Presigned S3 `PUT` and readback — FR-004, FR-008
- ffmpeg encode producing poster frame and HLS — FR-009
- Local JWT issuer round-trip — FR-001

## SC-009 is closed

294 assertions: 7 post states × 6 viewer relationships × 7 surfaces, generated
from [`contracts/visibility-matrix.md`](./contracts/visibility-matrix.md).
Nothing skipped.

Surfaces were enabled by the story that built each, so a skipped surface could
never be mistaken for a covered one:

| Surface | Enabled by |
|---|---|
| Interest space, profile | US1 (T063) |
| Interest search | US2 (T082) |
| Home feed | US3 (T098) |
| Share link, comments | US5 (T122) |
| Notifications | T154 — closed SC-009 |

## Benchmark results

Run 2026-09-05 against the `local` profile in a 4-core container: DynamoDB Local,
MinIO, ffmpeg. Dataset: 8,000 posts, 400 interests, 600 people, follow counts
bucketed 1–200.

**Read the caveat before the numbers.** DynamoDB Local is a single-process
development tool with no provisioned throughput and no distribution. It is not a
scale model of DynamoDB, so these figures characterise the *shape* of the
system's behaviour, not its production capacity.

### bench:feed — SC-005 (budget: p95 ≤ 2000ms) — **within budget**

| follows | fan-in | p50 | p95 |
|---|---|---|---|
| 1 | 1 | 20.9 | 29.8 |
| 5 | 5 | 52.0 | 76.5 |
| 20 | 20 | 120.1 | 154.4 |
| 50 | 50 | 140.8 | 159.3 |
| 100 | 100 | 198.8 | 231.9 |
| 200 | 200 | 299.6 | **343.2** |

The curve is roughly linear in follow count, which is exactly what research §D1
predicted and accepted. At the 200-interest cap it sits ~6× inside budget.

### bench:upload — SC-002 (budget: p95 ≤ 10s) — **within budget**

10 MB image: p95 **240.7ms**.

### bench:transcode — SC-003 (budget: p95 ≤ 60s) — **within budget**

| clip | p95 |
|---|---|
| 5s | 2.2s |
| 30s | 5.0s |
| 60s | 8.6s |
| **180s (the FR-005 cap)** | **26.5s** |

This validates the T020 decision. The cap was set at 180s rather than 300s
specifically because SC-003 requires playable-within-60s, and the measurement
confirms 180s lands at 26.5s with roughly 2.3× headroom. A 300s cap would have
been ~44s — inside budget but with little margin on slower hardware.

**Measures the ffmpeg adapter only.** Constitution principle V: this is not
evidence the MediaConvert path meets SC-003.

### bench:feed-load — SC-011 — **OVER BUDGET**

| concurrency | p50 | p95 |
|---|---|---|
| 1 | 125.3 | 304.2 |
| 10 | 937.3 | 1277.2 |
| 50 | 4713.2 | **5850.9** |
| 100 | 9438.0 | **11811.7** |

**This is the significant finding of the whole build.**

Latency degrades roughly linearly with concurrency and blows the 2s budget
between 10 and 50 concurrent readers — far short of the 10,000 SC-011 asks for.
The mechanism is the one research §D1 named when it accepted the trade: read-time
fan-in multiplies concurrency by follow count at the datastore, so 100 readers
each following 200 interests issues ~20,000 concurrent partition queries.

**What this does and does not establish.** It does not establish that production
would fail SC-011 — DynamoDB Local is a single Java process and provisioned
DynamoDB parallelises very differently. It does establish that the *coupling is
real and linear*, which is the part that does not change with better hardware:
the query count is a property of the design, not of the datastore.

**Recommended action before scaling.** Re-run against provisioned DynamoDB in a
staging account, with approval. If the shape holds, take the migration path
§D1 already records — materialise timelines for high-volume interests only, keep
read-time assembly and read-time visibility filtering for the tail. Do not adopt
full fan-out-on-write: FR-017 and SC-009 forbid it, and this report is not
grounds to reverse that.

## Success criteria

| Criterion | Status |
|---|---|
| SC-001 time to first post | Instrumented (`apps/mobile/src/lib/analytics.ts`) — needs real users |
| SC-002 image upload | `bench:upload` written |
| SC-003 video playable in 60s | `bench:transcode` written — **ffmpeg adapter only**, see below |
| SC-004 first-attempt publish rate | Instrumented — needs real users |
| SC-005 feed latency | `bench:feed`, reported by follow count |
| SC-006 onboarding | `GET /interests/suggested`, covered by tests |
| SC-007 / SC-008 aggregates | Analytics export written; needs production data |
| SC-009 no visibility leak | **VERIFIED — 294/294** |
| SC-010 moderation within 24h | Queue is oldest-first; needs operational data |
| SC-011 10k concurrent | `bench:feed-load` written |
| SC-012 second post within 7 days | Post-launch business KPI — out of scope |

The benchmarks are written and runnable but **have not been run against a seeded
dataset in this environment**. `pnpm --filter @sih/infra seed:load` writes
100k posts; that belongs on a machine with time to spare, not in the container
this was built in. The numbers are not claimed.

## What this does NOT validate

**The `aws` profile.** Nothing has been deployed and nothing has been
provisioned, per `plan.md` § Cost Posture. The AWS adapters are written and
shape-tested, but they throw `not provisioned` rather than faking success, so
selecting that profile fails loudly.

**The MediaConvert path.** Constitution principle V: ffmpeg and MediaConvert are
different implementations of the same port, not emulations of one another. A
green `bench:transcode` is **not** evidence SC-003 holds in production. See
[`docs/mediaconvert-smoke-test.md`](../../docs/mediaconvert-smoke-test.md),
which must run against a staging account before launch.

**Real-user criteria.** SC-001, SC-004, SC-007, SC-008 and SC-010 need people
using the product. The instrumentation to answer them exists; the answers do not.

**The mobile app on a device.** The screens are now real React Native components
and 31 render tests exercise them through @testing-library/react-native — a
component returning `null` typechecks perfectly, so a typecheck proved nothing
here and the render tests do. But the app has not run on a simulator or device,
and the Maestro flows have not been executed: that needs a simulator and a
reachable API, and a cloud sandbox has no inbound route.

## Constitution compliance

| Principle | Status |
|---|---|
| I. Interest Is the Organising Principle | Verified by `us4-fr033-boundary.spec.ts` |
| II. Visibility Is Decided Once | Verified by SC-009, 294/294 |
| III. Privacy Guarantees Enforced Server-Side | Verified by `us1-exif.spec.ts`, driven through the worker as a hostile client would |
| IV. Safety Ships With the Product | Phase 9 complete before any release |
| V. Emulation Is Not Evidence | Recorded above; MediaConvert explicitly unvalidated |
| Cost and Environment Constraints | **Held.** Nothing provisioned, no account, no credentials |
