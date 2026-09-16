# Specification Quality Checklist: The Interests Belong to the People Using Them

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-16
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

**RESOLVED in the plan phase** (research R7): the operator merge **queue** is NOT built in this
feature. The capability is, and already exists. Three reasons, the first of which is decisive: a
queue must propose candidates, and the only signal available scores true synonyms BELOW every
unrelated pair — a queue ranked by it would surface Golf/Wolf and never NYC/New York City.
Building the surface before there is a signal worth surfacing is the declared-half pattern again.
Revisit when a real installation has the volume, or when a better signal than edit distance
exists.

**Two naming notes for the implementer**, since this specification deliberately avoids
implementation detail and the vocabulary does not match the code:

- The spec says "the form used for matching"; the code calls this the normalised name.
- The spec says "live or merged away"; the code calls this the interest's state.

**On FR-011.** The requirement not to merge automatically is written against a MEASUREMENT taken
on this repository's own similarity function, reproduced in the spec body. It is not a matter of
taste, and if it is overturned it should be overturned against that table rather than around it.
