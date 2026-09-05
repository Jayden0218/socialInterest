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

**The mobile app end to end.** Screens and their logic are implemented and
typechecked, and Maestro flows are written for the US1 and US2 journeys, but
they have not been run — that needs a simulator and a reachable API, and a cloud
sandbox has no inbound route.

## Constitution compliance

| Principle | Status |
|---|---|
| I. Interest Is the Organising Principle | Verified by `us4-fr033-boundary.spec.ts` |
| II. Visibility Is Decided Once | Verified by SC-009, 294/294 |
| III. Privacy Guarantees Enforced Server-Side | Verified by `us1-exif.spec.ts`, driven through the worker as a hostile client would |
| IV. Safety Ships With the Product | Phase 9 complete before any release |
| V. Emulation Is Not Evidence | Recorded above; MediaConvert explicitly unvalidated |
| Cost and Environment Constraints | **Held.** Nothing provisioned, no account, no credentials |
