# Verification Run — <date> — <D-n>

Append-only. Never edited after the run completes; a correction is a new record.

| Field | Value |
|---|---|
| divergence_id | `D-n` |
| date | |
| version | Commit verified. **Required** — a run without it proves nothing about anything |
| approval_id | `A-n` from `../approvals.md`. **Required before the run starts** |
| outcome | `pass` / `fail` |
| cost | Actual spend. Recorded even when zero |
| teardown_confirmed | Set only by `verify:teardown`, never by the process that created the resources |

## What was proven

State the proof from the runbook, written **before** the run, and what was
observed against it.

| Proof | Observed | Result |
|---|---|---|
| | | |

## Evidence

A `fail` must record **what differed**, not just that it failed. That difference
is the whole value of the run.

## Notes

A `pass` is scoped to the commit above. When that commit is no longer current the
register entry becomes `stale`, not `verified`.
