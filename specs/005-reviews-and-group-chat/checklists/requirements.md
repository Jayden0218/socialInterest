# Specification Quality Checklist: Place reviews and group conversations

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-07
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

**All items pass.** The one marker — FR-023, blocking inside a group — was put to the
owner and answered: a person cannot be added to a group containing anyone in a blocking
relationship with them, and an existing group is left alone if a block happens later.

Answering it surfaced a requirement the question itself did not contain. The obvious
implementation of "refuse the add" tells the person adding that somebody blocked their
friend, which discloses a relationship between two OTHER people that neither of them
chose to share — and turns adding people to a group into a way to probe who has blocked
whom. FR-023a and SC-012 exist for that, and SC-012 compares the refusals as literal
responses, because a message that differs only in wording leaks the block just as well.

Every other gap the description left was closed with a documented assumption rather than
a question.

Two validation notes worth keeping:

- **"No implementation details" was checked against a real temptation.** The honest
  description of US3's cost is that `conversationIdFor` derives an id by hashing a sorted
  pair, and that groups cannot use it. That belongs in the plan, not here — so the spec
  says membership "MUST be stored explicitly and MUST NOT be derivable from the
  conversation's identifier" (FR-025), which is the requirement rather than the mechanism.
  The "What already exists" table names the function once, as measured fact about the
  current system rather than as a design instruction.

- **SC-008 is written as a migration assertion on purpose.** "Existing conversations still
  work" verified by creating new ones under the new code proves nothing about the rows
  already written. This project has shipped that shape of test before.
