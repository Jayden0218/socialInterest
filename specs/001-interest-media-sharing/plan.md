# Implementation Plan: Interest-Centred Media Sharing

**Branch**: `claude/spec-kit-integration-juhrza` | **Date**: 2026-09-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-interest-media-sharing/spec.md`

## Summary

A React Native app where people publish images and short video, file every post under
an interest, and browse and follow by interest rather than by a friend graph. Posts
carry per-post visibility (public / followers-only / private); interests form a curated
top level with user-created sub-interests beneath; people can be followed, but a
followed person's posts surface only inside interests the viewer also follows.

Technically: an **Expo** React Native client, a **TypeScript / NestJS** API on **ECS
Fargate**, **Lambda** workers for asynchronous media and catalogue jobs, **DynamoDB**
single-table storage, and **S3 + MediaConvert + CloudFront** for media. Media never
passes through the API — the client uploads to S3 via presigned URLs, and derivation
(including the EXIF strip that FR-010 requires) happens server-side.

> **The AWS services named above are a deferred placeholder, not a commitment.** All
> development and testing runs in Docker with no AWS account and no bill — DynamoDB
> Local, MinIO, ffmpeg, a local JWT issuer. Nothing in this plan may provision billable
> cloud resources without explicit approval. See [Cost Posture](#cost-posture) below and
> [research.md §D9](./research.md) for the runtime profiles that make this work.

Two decisions shape everything else, and both are driven by the spec rather than by
preference:

1. **The home feed is assembled at read time, not fanned out on write.** FR-017 demands
   a visibility change apply immediately everywhere, and SC-009 demands no leak on any
   surface. Materialised timelines make both properties something you maintain by hand;
   read-time assembly makes them fall out of a single evaluation. Details and the cost
   accepted: [research.md §D1](./research.md).
2. **Visibility is decided at exactly one choke point.** FR-018 lists six surfaces;
   six hand-written predicates is six chances to leak, silently. One `VisibilityFilter`
   plus the table-driven contract in
   [contracts/visibility-matrix.md](./contracts/visibility-matrix.md) turns SC-009 from
   an aspiration into a test. Details: [research.md §D6](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.6 on Node.js 22 LTS, across client, API, and workers

**Primary Dependencies**: Expo SDK (React Native), NestJS, AWS SDK v3, `sharp`,
`zod` for shared validation schemas

**Storage**: Amazon DynamoDB — single table `sih-main` with four GSIs
([data-model.md](./data-model.md)); Amazon S3 for media; CloudFront for delivery

**Testing**: Jest (unit), Jest + Supertest against DynamoDB Local (integration) — the
whole suite runs on the `local` runtime profile with no AWS account (research §D9),
contract tests generated from `contracts/openapi.yaml`, Maestro (mobile E2E), plus a
dedicated generated suite for the SC-009 visibility matrix

**Target Platform**: iOS 16+ and Android 10+ clients; Linux containers on ECS Fargate
for the API; Lambda for asynchronous workers

**Project Type**: Mobile application with a supporting HTTP API

**Performance Goals**: First feed content within 2s p95 (SC-005); 95% of sub-10MB image
uploads within 10s (SC-002); video playable within 60s of upload for 95% (SC-003);
10 000 concurrent browsers without degradation (SC-011)

**Constraints**: Visibility correct on every surface with zero leaks (SC-009);
EXIF/location stripped server-side and unbypassable by a modified client (FR-010);
interest hierarchy exactly two levels deep; a person may follow at most 200 interests
(the read-time feed assembly budget from research §D1)

**Scale/Scope**: 49 functional requirements across 6 prioritised user stories;
10 entities; 23 API paths; ~35 mobile screens. Initial target of 10k concurrent
viewers, low hundreds of top-level interests, thousands to low tens of thousands of
sub-interests.

## Cost Posture

**Decided 2026-09-05: no billable cloud resources until explicitly approved.**

All development and testing runs on the `local` runtime profile (research §D9) —
DynamoDB Local, MinIO, ffmpeg, a local JWT issuer, all in Docker. No AWS account, no
credentials, no bill. This covers every test in `quickstart.md`, including the SC-009
visibility matrix and all six user-story suites.

The AWS production target above is a **deferred placeholder, not a commitment**. It is
what the design assumes so that the adapters have a concrete other side; the decision
to actually deploy there has not been made.

**Constraint on `/speckit-tasks` and `/speckit-implement`**: do not generate or execute
tasks that provision billable cloud resources — no CDK deploy, no account bootstrap, no
managed service creation. Infrastructure-as-code may be *written* and validated with
`cdk synth` (which is free and needs no account); applying it is a separate, explicitly
approved step. Every functional task must be completable on the `local` profile.

**If the production target changes later**, the ports in `api/src/ports/` contain the
change — a new adapter set, not a rewrite. The one exception is a move away from
DynamoDB: it exists only as a managed AWS service (DynamoDB Local is a development
tool with no durability or replication story and cannot be shipped on), so self-hosting
means changing the database, which would mean rewriting `data-model.md` and revisiting
research §D3.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Evaluated against constitution v1.0.0 (ratified 2026-09-05). Status: PASS — all five
principles satisfied, no violations to justify.**

This section previously recorded "no gates defined", because the constitution was still
the unfilled scaffold. It was re-evaluated on ratification, as the constitution's own
governance rules require of any plan written before an amendment.

| Principle | Verdict | Where this plan satisfies it |
|---|---|---|
| **I. Interest Is the Organising Principle** (NON-NEGOTIABLE) | PASS | FR-033 is an intersection evaluated at read time in the feed service, asserted by a dedicated negative test — a followed author's post in an unfollowed interest must not appear. The design cannot satisfy a person-follow by widening the feed, because the followed-interest set bounds the query. |
| **II. Visibility Is Decided Once** (NON-NEGOTIABLE) | PASS | Research §D6 puts every read behind one `VisibilityFilter`, given its own top-level module rather than living inside `posts/`. `contracts/visibility-matrix.md` enumerates all seven surfaces and is implemented as a generated suite. The principle's prohibition on re-applying visibility to stored copies is precisely why §D1 chose read-time assembly over fan-out-on-write. |
| **III. Privacy Guarantees Are Enforced Server-Side** | PASS | FR-010's EXIF strip runs in the image worker, and `exifStripped` gates a media item reaching `ready`, so an unprocessed original cannot reach a reader. The task list carries a test that uploads GPS-tagged media through a client that skips its own stripping. |
| **IV. Safety Ships With the Product** | PASS | Reporting, blocking, and a human moderation path form a distinct phase preceding polish, with an append-only audit log that survives deletion of its subject. `tasks.md` states plainly that US1–US6 must not ship publicly without it. Sub-interest names are treated as content — screened at creation and reportable. |
| **V. Emulation Is Not Evidence** | PASS | Research §D9 names the one genuine divergence — ffmpeg is a different implementation of the `MediaProcessor` port, not an emulation of MediaConvert — and carries a staging smoke-test procedure as the stated verification plan. Where the local tool speaks the same API (DynamoDB Local), no adapter was invented, as the principle instructs. |

**Cost and Environment Constraints**: satisfied — see [Cost Posture](#cost-posture)
above, which the constitution now generalises from a per-feature note into a project-wide
rule. Every functional task is completable on the `local` profile; IaC is written and
validated with `cdk synth` only.

**Development Workflow and Quality Gates**: satisfied — spec preceded plan preceded tasks;
the three clarifications with no safe default were put to the project owner rather than
assumed; contract-defining tests are scheduled ahead of the implementations they govern;
and every buildable success criterion gained a measurement task after the
`/speckit-analyze` pass.

**Post-Phase-1 re-check**: PASS, unchanged. No Phase 1 design decision conflicts with a
principle. Notably the two decisions the constitution constrains most tightly — read-time
feed assembly and the single visibility boundary — were made *before* the constitution
existed, derived from FR-017 and SC-009. The constitution codified them rather than
forcing a change, which is why this re-evaluation required no rework.

**Complexity Tracking**: no entries. That table records justified violations; there are
none.

### Re-evaluation against constitution 2.0.0 (2026-09-08) — 007/RS-005

The constitution's governance section requires any plan written before an amendment to be
re-evaluated against it. Amendment 2.0.0 rewrote Principle I and strengthened Principle II.
**Verdict: PASS with one principle no longer satisfied AS ORIGINALLY ARGUED.**

| Principle (2.0.0) | Verdict | What changed |
|---|---|---|
| **I. Interest Is the Unit of Meaning** (NON-NEGOTIABLE) | **PASS, on a different argument** | The row above satisfied v1.0.0 by way of FR-033 — the followed-interest set bounded the query, so a person-follow could not widen the feed. **That argument is withdrawn with FR-033 (007/RS-001).** 001 still satisfies 2.0.0 because interest remains the unit every post is filed under, every space is browsed by, and the catalogue is organised around; what changed is that the FEED is no longer assembled from subscriptions. The parts of 001 that satisfy the amended principle are FR-020 through FR-032 (the catalogue, filing, sub-interests, merges), not FR-033. |
| **II. Visibility Is Decided Once** (NON-NEGOTIABLE) | **PASS, and the accident is now named** | 2.0.0 adds: *ranking selects candidates; the visibility boundary decides*. 001's feed satisfied that clause **by accident** — it only ever read partitions the viewer had subscribed to, so its candidate set was already viewer-scoped and could not over-admit whatever the ordering did. Nothing in 001 asserted the boundary's POSITION. 007 removes that accident and replaces it with `contracts/ranking-boundary.md` and a build-failing dependency guard. |
| **III. Privacy Enforced Server-Side** | PASS, and now broader | 2.0.0 adds a behavioural-signals clause. 001 collects no behavioural signals, so nothing here conflicts; 007 is where that clause is discharged. |
| **IV. Safety Ships With the Product** | PASS, unchanged | Nothing in the amendment touches it. |
| **V. Emulation Is Not Evidence** | PASS, unchanged | Nothing in the amendment touches it. |

**No rework of 001 follows from this.** The withdrawn requirements are struck through in
`spec.md` with pointers to what replaced them, which is what the amendment requires of an
invalidated requirement: an invalidated requirement that is merely ignored still reads as a
promise.

## Project Structure

### Documentation (this feature)

```text
specs/001-interest-media-sharing/
├── plan.md                        # This file
├── spec.md                        # Feature specification
├── research.md                    # Phase 0 — decisions D1-D9 with alternatives
├── data-model.md                  # Phase 1 — DynamoDB single-table design
├── quickstart.md                  # Phase 1 — run and validation guide
├── contracts/
│   ├── openapi.yaml               # Phase 1 — 23 paths, 34 schemas
│   └── visibility-matrix.md       # Phase 1 — the SC-009 contract
├── checklists/
│   └── requirements.md            # Spec quality checklist (16/16)
└── tasks.md                       # Phase 2 — created by /speckit-tasks, not here
```

### Source Code (repository root)

A pnpm workspace monorepo. The shared package is the point: client and server import
the same request/response types and the same `zod` validation schemas, so a change to
the API contract fails the mobile build rather than reaching a user.

```text
apps/
├── mobile/                        # Expo React Native client
│   ├── src/
│   │   ├── features/              # publish, discover, feed, profile, engagement, safety
│   │   ├── components/
│   │   ├── navigation/
│   │   └── api/                   # generated client from contracts/openapi.yaml
│   └── e2e/                       # Maestro flows
│
├── api/                           # NestJS service on ECS Fargate
│   ├── src/
│   │   ├── modules/
│   │   │   ├── people/
│   │   │   ├── interests/         # hierarchy, catalogue cache, near-duplicate matching
│   │   │   ├── posts/
│   │   │   ├── media/             # presigned upload issuance
│   │   │   ├── feed/              # read-time fan-in assembly and ranking
│   │   │   ├── engagement/
│   │   │   ├── safety/            # reports, blocks
│   │   │   └── moderation/
│   │   ├── visibility/            # the single choke point — research §D6
│   │   ├── ports/                 # ObjectStore, MediaProcessor, IdentityProvider, EventBus
│   │   ├── adapters/
│   │   │   ├── aws/               # S3, MediaConvert, Cognito, EventBridge
│   │   │   └── local/             # MinIO, ffmpeg, local JWT issuer, in-process queue
│   │   └── persistence/           # single-table access layer — no adapter; DynamoDB Local
│   │                              # speaks the same API as the managed service
│   └── tests/
│       ├── unit/
│       ├── integration/           # acceptance scenarios vs DynamoDB Local
│       ├── contract/              # generated from openapi.yaml
│       └── visibility/            # generated from visibility-matrix.md — SC-009
│
└── workers/                       # Lambda handlers
    ├── media-image/               # derivatives + EXIF strip (FR-010)
    ├── media-video/               # MediaConvert orchestration (FR-009)
    ├── interest-jobs/             # merge, re-parent, retire (FR-030)
    ├── account-deletion/          # FR-003 purge and anonymisation
    └── analytics-export/          # table → S3 → Athena for SC-007, SC-008

packages/
└── shared/                        # types, zod schemas, generated API client

infra/                             # AWS CDK — table + GSIs, buckets, Fargate, Lambdas, CloudFront
```

**Structure Decision**: mobile + API, as a monorepo. The spec is a mobile-first product
(`Assumptions`) with a server that no other client consumes, so a workspace keeps the
contract in one place and makes the shared types real rather than a convention. The
`workers/` split exists because the media pipeline and the interest jobs are genuinely
event-driven and independently scaled — putting them in the API container would tie
transcode bursts to feed-serving capacity. `visibility/` is deliberately a top-level
concern within the API rather than a utility inside `posts/`, so that every module
reaches it the same way and no module can quietly grow its own copy. `ports/` and
`adapters/` exist so the entire stack runs with no AWS account — see research §D9 for
what that buys and the one place (MediaConvert) where the two adapters genuinely
diverge rather than emulate each other.

## Phase Outputs

| Phase | Artifact | Status |
|---|---|---|
| 0 | [research.md](./research.md) — 9 decisions, each with alternatives | Complete; no `NEEDS CLARIFICATION` remaining |
| 1 | [data-model.md](./data-model.md) — 20 access patterns, 10 entities, key schema, state transitions | Complete |
| 1 | [contracts/openapi.yaml](./contracts/openapi.yaml) — 23 paths, 34 schemas, each citing its FRs | Complete; parses as valid OpenAPI 3.1 |
| 1 | [contracts/visibility-matrix.md](./contracts/visibility-matrix.md) — the SC-009 contract | Complete |
| 1 | [quickstart.md](./quickstart.md) — setup plus per-story validation | Complete |
| 2 | `tasks.md` | Not created by `/speckit-plan` — run `/speckit-tasks` |

## Risks Carried Into Implementation

Recorded here so `/speckit-tasks` can schedule the checks rather than discovering these
late. None of them blocks planning.

| Risk | Where it bites | Early signal to watch |
|---|---|---|
| Read-time feed assembly scales with follow count | SC-005 at the 200-interest cap | **MEASURED 2026-09-05: p95 343ms at 200 follows, within the 2s budget.** The curve is linear, as D1 predicted |
| **Read-time fan-in degrades under CONCURRENCY** | **SC-011** | **MEASURED 2026-09-05: OVER BUDGET — p95 1.3s at 10 concurrent, 5.9s at 50, 11.8s at 100, against a 2s budget.** On DynamoDB Local, which is not a scale proxy — but the coupling is a property of the design, not the datastore. Re-measure on provisioned DynamoDB before scaling; if the shape holds, take the hybrid path in research §D1. See validation-report.md |
| DynamoDB cannot do fuzzy interest matching; v1 relies on an in-memory catalogue cache | FR-023, FR-026 | Catalogue size and cache refresh latency; the seam is a `CatalogueSearch` interface, so OpenSearch replaces it without touching callers |
| Interest merge rewrites an unbounded number of items asynchronously | FR-030 | Job duration on the largest real interest; must stay idempotent under retry |
| Reactions on one post share a DynamoDB partition | A viral post | Throttling on the post partition; sharded counters are the prepared, unbuilt answer |
| Background upload continuation may need a native module | FR-008 retry across backgrounding | Spike early in mobile work — it is the one place Expo's managed surface may not reach |
| Video duration cap is not yet a number | FR-005 | Pick it during `/speckit-tasks`; it is referenced by the upload contract and by MediaConvert presets |
| ffmpeg and MediaConvert are different implementations of the `MediaProcessor` port, not emulations | FR-009 in production | Green local video tests are not evidence the `aws` path works; schedule a MediaConvert smoke test in staging before launch (research §D9) |

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

No violations to record. The Constitution Check above evaluates this plan against
constitution v1.0.0 and finds all five principles satisfied.
