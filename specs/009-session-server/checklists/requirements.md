# Specification Quality Checklist: Disposable Session Server

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-12
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**Iteration 1 found two failures, both under Content Quality, both fixed:**

- *No implementation details* / *Written for non-technical stakeholders* — the "Why This
  Exists" section described the existing arrangement in terms of continuous integration and
  a host-loopback alias. Rewritten to state the same fact — app and backend on one machine,
  which a phone cannot join — without naming the mechanism.
- One edge case described the media address as architecture rather than as something a
  person experiences. Rewritten around the symptom (a working app with blank images).

**Zero [NEEDS CLARIFICATION] markers, deliberately.** Four decisions the feature description
left open were resolved as informed defaults and written into Assumptions rather than
deferred: session lifetime, data disposability, visibility of the address field, and who may
use a session. The constitution requires ambiguity to be put to the owner only where no safe
default exists and scope, privacy, or user experience would materially change. None of the
four met that bar. One of them — the 2-hour default — was put to the owner and is recorded
in Assumptions as chosen in the absence of an answer, so it is visible rather than silent.

**One requirement deliberately encodes a past failure.** FR-006 (the submit control stays
reachable with the keyboard open) reads like a layout detail, but it is a requirement
because this exact surface has failed it before and the failure cost several runs. It is
stated as an invariant so that a change which breaks it fails a requirement, not just a
measurement.

**Success criteria this feature can measure, and one it cannot yet.** SC-001 through SC-008
are all measurable by observation on a device or by inspection. None of them claims anything
about durability, production readiness, or the open hosting question — see Out of Scope,
which names those explicitly so a future reader does not read this feature as having
closed them.

## T007 — what the reds actually said (2026-09-12)

Recorded because the task asks for it, and because "watched it fail" is a claim that should
carry its evidence.

- **`settings-store.test.ts` was red for the WRONG REASON**, exactly as the note at the top
  of `tasks.md` predicted for the other contract: `Cannot find module '../data/settings-store'`.
  A missing file, not a product fact.
- **Worse, it hid the one red that mattered.** The meaningful assertion — that the data layer
  offers a device backing store — was written as a `describe` inside that same file, so the
  suite failed to load and the assertion never ran at all. Evidence that exists and cannot be
  reached is run 40 and run 56 in a third place, and it happened here in the same session that
  wrote those sentences down. It lives in `device-storage.test.ts` now, importing only code
  that already existed, and was then observed red against the shipped product:
  `deviceKeyValueStore` → `Expected: "function" / Received: "undefined"`.
- **`address-is-not-a-permission.test.ts` PASSED on its first run**, which is not evidence of
  anything. It was verified by injecting a real violation — an `API_BASE_URL` import into
  `screens/SavedContainer.tsx` — and observed red naming the offending file, then green again
  on revert.

## What could not be run in this environment

`apps/e2e`'s browser suite cannot start here: its global setup creates a MinIO bucket, and
`quay.io` answers `Forbidden` from this sandbox (the dead-ends table records this; confirmed
again by `docker pull`). T017's measurement was therefore taken standalone against the real
web build rather than through the harness. The assertion is committed and will run in CI.
