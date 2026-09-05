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

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

**Status: no gates defined — `.specify/memory/constitution.md` is still the unfilled
template.** Its principle names and bodies remain as `[PRINCIPLE_1_NAME]` placeholders,
so there is nothing to evaluate against. This is recorded rather than treated as a
failure: an absent constitution is a missing gate, not a violated one.

**Consequence**: the design decisions in `research.md` were made against the spec's own
requirements and success criteria, with no project-level principles constraining
technical choice. Several decisions below are exactly the sort a constitution normally
governs and which a later constitution could legitimately overturn:

| Decision | A principle that would change it |
|---|---|
| NestJS as the API framework | A simplicity or minimal-dependency principle might prefer plain Fastify |
| Single-table DynamoDB design | A "prefer boring, queryable storage" principle would favour the PostgreSQL alternative in research §D3 |
| Fargate for the API rather than all-Lambda | A serverless-first or cost-floor principle would invert this |
| Read-time feed assembly | Would likely *survive* any principle — it is required by FR-017/SC-009, not chosen for taste |
| Test-first discipline | Undecided here; a TDD principle would reorder the whole of `tasks.md` |

**Recommendation**: run `/speckit-constitution` before `/speckit-implement`. Doing it
before `/speckit-tasks` is better still — a test-first principle in particular changes
the shape of the task list, not just its contents. This plan is structured so that
reconsidering any single row above is a contained change.

**Post-Phase-1 re-check**: unchanged. No gate was introduced or violated during design,
because none exists. No entry is needed in Complexity Tracking — that table records
justified violations, and there is nothing here to violate.

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
| Read-time feed assembly scales with follow count | SC-005 at the 200-interest cap | `bench:feed` p95 curve by follow count, from the first week of the feed module |
| DynamoDB cannot do fuzzy interest matching; v1 relies on an in-memory catalogue cache | FR-023, FR-026 | Catalogue size and cache refresh latency; the seam is a `CatalogueSearch` interface, so OpenSearch replaces it without touching callers |
| Interest merge rewrites an unbounded number of items asynchronously | FR-030 | Job duration on the largest real interest; must stay idempotent under retry |
| Reactions on one post share a DynamoDB partition | A viral post | Throttling on the post partition; sharded counters are the prepared, unbuilt answer |
| Background upload continuation may need a native module | FR-008 retry across backgrounding | Spike early in mobile work — it is the one place Expo's managed surface may not reach |
| Video duration cap is not yet a number | FR-005 | Pick it during `/speckit-tasks`; it is referenced by the upload contract and by MediaConvert presets |
| ffmpeg and MediaConvert are different implementations of the `MediaProcessor` port, not emulations | FR-009 in production | Green local video tests are not evidence the `aws` path works; schedule a MediaConvert smoke test in staging before launch (research §D9) |

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

No violations to record — the Constitution Check above found no gates to violate, as
`.specify/memory/constitution.md` is still the unfilled template.
