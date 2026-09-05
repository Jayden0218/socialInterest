# Data Model: Production Readiness

**Feature**: 002-production-readiness | **Date**: 2026-09-05

## Scope note

**This feature adds no new persisted entities to the `sih-main` table**, with one conditional
exception recorded below. Its records are evidence artifacts held in the repository, not
application data. That is deliberate: the feature's job is to establish what is true about the
system already built, and evidence that lives in a database the feature is also changing is
evidence with a conflict of interest.

---

## Repository-held records

### Divergence Record

Lives in `docs/verification/divergence-register.md`. One row per capability where the local
stand-in and the production service are different implementations.

| Field | Type | Rules |
|---|---|---|
| `id` | string | `D-<n>`, stable for the life of the divergence |
| `capability` | string | What the system does, in user terms |
| `local` | string | The stand-in used in development and CI |
| `production` | string | The service the `aws` profile targets |
| `why_it_can_differ` | string | The specific behaviours that may not match. Not "it's a different service" |
| `proof` | string | What observation would count as evidence the production path works |
| `status` | enum | `unverified` \| `verified` \| `failed` \| `stale` |
| `last_run` | reference | The Verification Run that set the current status, if any |

**Completeness rule (FR-014)**: every distinct implementation under `apps/api/src/adapters/aws/`,
plus every production-only delivery path, MUST have a register entry. A capability whose local
and production implementations speak the same API is explicitly excluded and MUST NOT be given
an entry — DynamoDB is the standing example.

**Status transitions**: `unverified → verified | failed` by a Verification Run.
`verified → stale` automatically when the verified version is no longer current — a
verification is evidence about a version, never a standing property (FR-023).

---

### Verification Run

Lives in `docs/verification/runs/<date>-<divergence-id>.md`. Append-only; never edited after
the run completes.

| Field | Type | Rules |
|---|---|---|
| `divergence_id` | reference | The Divergence Record being proven |
| `date` | date | When the run executed |
| `version` | string | Commit verified. Required — a run without it proves nothing about anything |
| `approval_id` | reference | The Approval Record it ran under. Required before the run starts |
| `outcome` | enum | `pass` \| `fail` |
| `evidence` | string | What was observed. A `fail` MUST record what differed, not just that it failed |
| `cost` | money | Actual spend, recorded even when zero |
| `teardown_confirmed` | boolean | Set only by an independent check, never by the creating process |

**Invariant**: a Verification Run with `teardown_confirmed: false` older than 24 hours is an
incident, not a record — resources may still be running and billing.

---

### Approval Record

Lives in `docs/verification/approvals.md`.

| Field | Type | Rules |
|---|---|---|
| `id` | string | `A-<n>` |
| `scope` | string | Exactly what was approved. One verification, or one named window |
| `ceiling` | money | Maximum authorised spend |
| `granted_at` | date | |
| `granted_by` | string | The project owner |

**Rule**: an Approval Record covers one scope. Reusing an approval for a different purpose is a
violation, not a shortcut (constitution: "Approval for one deployment is not approval for the
next").

---

### Load Measurement

Lives in `docs/verification/runs/<date>-load.md`, and is also the output shape of
`bench:feed-load`.

| Field | Type | Rules |
|---|---|---|
| `transport` | enum | `http` \| `in-process`. Required, because 001's figures were in-process and read as if they were not |
| `datastore` | string | What the reads actually hit |
| `levels` | list | Concurrency level → p50, p95, p99, throughput, error count |
| `first_breach` | integer | Concurrency at which p95 first exceeds 2000 ms |
| `bottleneck` | enum | `generator` \| `application` \| `datastore` \| `undetermined` |
| `bottleneck_evidence` | string | How the attribution was established (FR-012). `undetermined` is a permitted and honest value |

**Rule**: a Load Measurement reporting a `first_breach` without a `bottleneck` attribution MUST
NOT be cited as evidence about the design. This is the specific mistake this feature exists to
avoid repeating.

---

### Outcome Measure

Lives in the generated usage report. Never per-person.

| Field | Type | Rules |
|---|---|---|
| `criterion` | reference | The 001 success criterion measured |
| `target` | string | As stated in 001 |
| `population` | integer | Participants in the window |
| `window` | date range | Start and end |
| `observed` | number \| `unmeasurable` | |
| `met` | boolean \| `n/a` | |
| `suppressed` | boolean | True when a cell fell below the 20-person floor |

**Rules**: aggregates only (FR-028); any cell below 20 people is suppressed rather than rounded;
a window with fewer than 50 participants or shorter than 14 days reports `unmeasurable` rather
than a number (FR-030); the moderation criterion counts undecided reports as misses (FR-027).

---

### Journey Run

Lives in `docs/verification/runs/<date>-journeys.md` for Tier B; Tier A emits the same shape as
CI output.

| Field | Type | Rules |
|---|---|---|
| `tier` | enum | `A` (automated, over HTTP) \| `B` (physical device) |
| `platform` | enum | `ios` \| `android` \| `n/a` |
| `device` | string | Required when `tier: B` |
| `results` | list | One entry per journey in the core set, pass or fail |

---

## Conditional application data

### Materialised interest index — **only if R1 attributes the ceiling to the application**

Not planned, not built, and forbidden in its most obvious form. Recorded here so that if it is
later introduced, the constraint travels with it:

- It MAY hold **candidate post references** for high-volume interests.
- It MUST NOT hold a rendered or viewer-specific timeline.
- `VisibilityFilter` MUST still run at read time over every candidate it returns, so that a
  visibility change takes effect immediately without touching this structure (Principle II,
  FR-007).
- Introducing it requires the full visibility matrix to pass unchanged at 294 assertions
  (FR-010), and the follow-expansion tests to still prove a person-follow does not widen the
  feed (Principle I).

If those conditions cannot all hold, the structure is not admissible and the conflict goes to
the project owner (FR-011).
