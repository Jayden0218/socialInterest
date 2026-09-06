# Specification Quality Checklist: Runnable on a real device, and somewhere to run

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-06
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

**Validation, iteration 1 — two issues found and fixed.**

1. *Implementation detail in success criteria.* SC-001 through SC-011 originally named
   DynamoDB, PostgreSQL, `/dev/kvm`, APKs and `verify:teardown` directly. Rewritten in terms
   of outcomes — "a real datastore", "an Android runtime", "a check that enumerates rather
   than assumes". The concrete names remain in *What 002 handed over* and in the user stories'
   rationale, which is where a reader needs them to know what is being talked about, and out
   of the criteria, which must survive a change of technology.
2. *Success criteria that could be satisfied by not trying.* An earlier SC-001 read "Android
   is verified or reported unverified", which is true however little work is done. It now
   requires either a completed set of journeys **with the service confirming each effect**,
   or **recorded evidence** of why the runtime could not be obtained. FR-003 carries the same
   requirement.

**No [NEEDS CLARIFICATION] markers.** Three candidates were considered and resolved from
context rather than asked:

- *Which host?* Deliberately unspecified. The spec requires reachability, durability across
  restart, and a real identity provider; naming a vendor is a planning decision and would be
  an implementation detail here.
- *Device farm or hardware in the room?* Both satisfy Story 1. Recorded as an assumption.
- *Participant group size for Story 6?* No reasonable default exists, but it does not change
  scope — the window and its outcomes are declared before it opens either way. Left to
  planning.

**One deliberate deviation from the template.** The spec carries a *What 002 handed over*
table naming concrete artefacts. This is a continuation feature whose entire purpose is the
eight items 002 could not close; a reader cannot judge the stories without knowing what they
inherited. The functional requirements and success criteria are kept clean of it.

**Known unusual property of this feature.** Six of eight user stories are blocked on an owner
decision or on resources this repository cannot obtain, and the spec says so plainly rather
than proposing substitutes. That is the honest state, and the accompanying risk is that the
substitutes get invented later under pressure — FR-004, FR-013 and FR-019 exist specifically
to forbid that.
