# Specification Quality Checklist: Ranked Feed and App Redesign

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-08
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

## Constitution 2.0.0 check

Recorded here because this feature is the reason the constitution was amended.

- [x] **I. Interest Is the Unit of Meaning.** Every post filed under an interest
      (FR-016), interest surfaces complete and browsable (FR-017-FR-019), ranking
      inspectable and resettable (FR-011, FR-012). The three clauses that keep
      interests load-bearing are each a requirement, not a note.
- [x] **II. Visibility Is Decided Once.** FR-005 states ranking selects candidates only
      and every result set passes the boundary at read time; FR-006 keeps visibility
      changes immediate. SC-005 and SC-006 measure both.
- [x] **III. Privacy Enforced Server-Side.** FR-013 forbids one person's signals being
      readable or inferable by another; SC-007 checks it across every enumerated
      surface. FR-011 is the disclosure the principle's new clause requires.
- [x] **IV. Safety Ships With the Product.** US5 carries report and block, and SC-010
      measures reachability at the largest font on the shortest screen — the case that
      reached production once.
- [x] **V. Emulation Is Not Evidence.** No new divergence is introduced; the ranking
      service is part of the application, not a managed service with a local stand-in.

## Notes

**Four judgement calls worth reviewing before planning:**

1. **Ranking QUALITY is deliberately not specified.** SC-001 asserts the feed moves in
   the direction of the signals, not that the result is good. Measuring quality needs
   real usage, which this project has never had; a number invented here would be a
   target the tests hit and the product misses.
2. **Reports and comments are excluded from the signals** (Assumptions). A report is not
   a preference. Treating engagement-with-bad-content as interest is the single most
   common way a ranked feed becomes harmful, and excluding it is cheaper than detecting
   it later.
3. **FR-007 requires exploration in every response.** Without it a feed converges on one
   interest and cannot recover, because the signals that would broaden it can never be
   generated. This is a correctness requirement, not a preference.
4. **Removed Scope carries six withdrawals**, each of which must become a task. RS-002 in
   particular says the FR-033 negative test is DELETED rather than weakened - a softened
   version would assert a boundary the product no longer has and would read as coverage.
