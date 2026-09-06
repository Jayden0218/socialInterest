# Data Model: Verified in the cloud, end to end

**Feature**: 003-device-and-hosting | **Date**: 2026-09-06

This feature adds no product entities. Nothing in the DynamoDB single-table design changes,
and no access pattern is added. What follows are **evidence records** — files written to
`docs/verification/` — plus the one product-facing change Story 2 makes to how existing data
is stored.

## Evidence records

### Runtime Attempt

A record of trying to start an Android runtime. Exists so that a failure produces evidence
rather than a hypothesis (FR-003, FR-004).

| Field | Rule |
|---|---|
| `date` | Required |
| `configuration` | Required. Image, ABI, options, runner image — enough to repeat it |
| `outcome` | Required. `booted` \| `failed` \| `timed_out` |
| `runtime_output` | **Required, always, including on success.** The runtime's own stdout and stderr. A record without it is invalid |
| `conclusion` | Required only when `outcome` is not `booted`. What the output shows, not what it might mean |

**Validation**: an attempt with `outcome: failed` and empty `runtime_output` is the exact
artefact this feature exists to prevent. It MUST fail the run rather than be recorded.

**State**: append-only. An attempt is never edited after the fact.

### Journey Run

Extends the record 002 already uses, with one field added.

| Field | Rule |
|---|---|
| `runtime` | Required. `android-emulator` \| `browser`. **`android-device` and `ios` are not producible by this feature** |
| `build` | Required. The commit the run used |
| `date` | Required |
| `results` | One row per journey. `pass` \| `fail` \| `not run` — never blank |
| `evidence` | Required for `android-emulator`: at least one non-blank capture of the app's own interface (FR-002) |

**Validation**: a run whose `runtime` is `android-emulator` and whose `evidence` is absent or
blank does not satisfy SC-002. A `browser` run MUST NOT be recorded with a `runtime` implying
a device (FR-005).

### Load Measurement

Extends 002's record with one required field.

| Field | Rule |
|---|---|
| `transport` | Required. Existing |
| `datastore` | **New, required.** What the datastore actually was, and whether it was the same software a deployment would run |
| `concurrency` | Required. The concurrency actually reached |
| `latencies` | Required. Including p95 |
| `binding_constraint` | Required. `generator` \| `datastore` \| `application` |

**Validation**: when `datastore` is a stand-in, the record is a measurement of the stand-in and
MUST be reported as such (FR-013). It MUST NOT be cited as a statement about the product.

### Datastore Decision

One record, written once, for Story 3.

| Field | Rule |
|---|---|
| `options` | Required. At least the incumbent and the alternative D3 named |
| `migration_cost` | Required per option. Counted from the **14 repository classes** that would change, not estimated in the abstract |
| `runs_as_itself_locally` | Required per option. Whether the local form is the same software or a stand-in — this is what decides whether Story 5 is answerable |
| `decision` | Required |
| `decided_by` | Required |

## The one product-data change

Story 2 changes **where existing data lives**, not what it is.

| Component | Now | After | Why it matters |
|---|---|---|---|
| Datastore | In memory | On a mounted volume | Every post is lost on restart today |
| Object storage | Container writable layer | Mounted volume | Every upload is lost when the container is recreated |
| Event record | None — delivered on the next tick | Persisted with a handled flag | An event published before a crash is dropped silently. That is the same shape as 002's unsubscribed `post.created`, where a post never left `pending` and was invisible to everyone but its author |

**No schema change.** Keys, indexes and access patterns in `001/data-model.md` are untouched —
unless Story 3 decides against the current datastore, in which case that decision carries its
own migration and this table is superseded.

## Retention

Evidence records are permanent and append-only, as in 002. A Runtime Attempt in particular is
kept even when it fails, because the failure is the evidence.
