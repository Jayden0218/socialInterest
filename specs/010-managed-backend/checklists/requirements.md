# Specification Quality Checklist: A Backend That Stays Up

**Purpose**: Validate specification completeness and quality before planning
**Created**: 2026-09-13
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
- [x] Success criteria are technology-agnostic
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

**Deliberately names no product.** A scan for `postgres|supabase|koyeb|dynamo|docker|sql|ffmpeg`
returns nothing (the one hit is `US3` containing the letters "s3"). The choice of datastore,
storage and host belongs in the plan, where the alternatives can be weighed and recorded. A
spec that names Supabase in FR-002 could not later be satisfied by anything else without
rewriting the requirement, and the requirement — *reachable with no payment method on file* —
is the thing that is actually binding.

**Three edge cases exist to stop something changing by accident**, which is the harder kind
to catch:

- The twenty-person group cap loses its technical reason with this feature. 005 records it as
  a *correctness* constraint forced by a 100-item limit, not a product preference. When that
  limit goes, the cap becomes a decision nobody has made — so the spec forbids changing it
  here and says why.
- "Nothing needs migrating" is written as a thing **to confirm**, not an assumption to rely
  on. If it is wrong, it is catastrophically wrong, and the cost of checking is minutes.
- Orphaned media has never mattered because storage was disposable. With a 1 GB ceiling it
  starts to.

**FR-006 is the whole safety story.** This feature moves where data lives and changes nothing
about who may see it. The plan's gate is mechanical: the visibility totals and the
public-route snapshot must come out identical, or the design is wrong.

**SC-001 and SC-005 take seven days to measure.** That is honest rather than convenient —
"it persists" is not observable in an afternoon, and a criterion that cannot be rushed is the
point of writing it down.
