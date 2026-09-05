# Contract: Divergence Register

**Feature**: 002-production-readiness

This document defines the **format and the completeness rule** for the live register at
`docs/verification/divergence-register.md`. It is the artifact that discharges Principle V.

## Inclusion rule

A capability belongs in the register when the local stand-in and the production service are
**different implementations** rather than emulations of one another.

A capability MUST NOT be added when the local tool speaks the same API as its production
counterpart. Principle V's second clause is explicit that no adapter should be invented to
separate them, and 001's D9 applies this to DynamoDB. Adding a spurious entry is as much a
defect as omitting a real one: it makes the register's completeness unfalsifiable.

## Completeness rule (FR-014)

For every implementation file under `apps/api/src/adapters/aws/`, and for every production-only
delivery path, there MUST be exactly one register entry.

This is enforced mechanically, not by review. A check compares the register against the adapter
directory and fails when they disagree in either direction. A change that introduces a new
production implementation without a register entry is **incomplete**, and the build says so.

## Entry format

See [data-model.md](../data-model.md#divergence-record) for fields. Two rules about content:

- `why_it_can_differ` MUST name specific behaviours. "It is a different service" is not an
  entry; "presign semantics, consistency model, and error taxonomy differ" is.
- `proof` MUST be an observation, stated before the run. Deciding what would have counted as
  proof after seeing the result is not verification.

## Implementation state is part of the entry

Every entry records `implementation` as `real`, `stub`, or `absent` (FR-031). This exists because
the register would otherwise report an entry as `unverified` whether the production code was
written-and-untested or entirely missing — two very different situations that need different
work. At the time this contract was written, D-1 was `real`, D-2 and D-3 were `stub`, and D-4
was `absent`.

A `stub` or `absent` entry MUST NOT be scheduled for a Verification Run. It needs an
implementation first.

## Status honesty

- A `verified` status is scoped to the version in its Verification Run. When that version is no
  longer current, the status becomes `stale` — not `verified`.
- A `failed` status MUST NOT be cleared by re-running until the cause is understood. Re-running
  a flaky verification until it passes produces a record that means nothing.
- The register MUST reflect current state. It is not a history; Verification Runs are.
