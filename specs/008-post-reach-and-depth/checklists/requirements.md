# Specification Quality Checklist: A complete app — reach, depth and control

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-09
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

**Scale is the finding, not a defect in the spec.** 15 stories, 54 functional
requirements and 17 success criteria is several features' worth of work, and the
spec says so in its own closing section rather than pretending otherwise. The
phases are the unit a release can be cut at: **Phase A alone is coherent** and is
the recommended first cut. Planning should scope a phase, not the document.

**Two named endpoints survived the "no implementation details" rule deliberately.**
`POST /v1/posts/:postId/share-link` and `ShareResolutionService` are named once, in the
scoping section, to establish WHAT ALREADY EXISTS. Without them the spec would read as a
proposal to build sharing, which would be wrong and would waste the feature. They appear in
no requirement and in no success criterion.

**Phase A is not new functionality — it is three promises already made.** The
product ships a limit of "Up to 10 photos" while every render path reads only
`media[0]`; `readAt` is declared on every notification, returned to every client
and written by nothing; and the Following tab is rendered with nothing behind it.
Each was found by surveying the build, not by borrowing from another product,
and each is the same defect class 007 recorded: a declared half with no other
half. That class is why the survey, not the feature list, drove the scope.

**Borrowed patterns were filtered against this build.** The research
(Xiaohongshu's note/Nearby/store loop; a general social-app checklist) supplied
candidates; anything with no evidence of being needed *here* was dropped and is
listed under "What this spec does NOT add" rather than left implicit.

**Both open judgements were settled by planning, and the spec was edited rather
than left to point at a design document.**

- **Reply nesting** is bounded at one level, and that bound now lives in
  **FR-025 itself**. A requirement whose bound is only in `research.md` is one a
  reader cannot test from the spec.
- **A private account** (US13) is a visibility input to the one existing
  boundary, never a second filter — Principle II makes that non-negotiable, and
  `contracts/selection-vs-boundary.md` now states the test that decides which
  side any such rule falls on.

**One success criterion was amended, and the amendment is the honest kind.**
SC-006 read "in under 30 seconds". The constitution requires every stated numeric
criterion to have a task that measures it, and on this stack a stopwatch measures
the emulator rather than the product — the same reason 002/SC-002's timing half is
recorded unverified. SC-006 now bounds the path at **four interactions with every
step asserted populated**, and the device run records elapsed time as an
observation that is never a pass condition. Changing a criterion to make it
measurable is legitimate; leaving one unmeasured is not.

**One assumption arrived from the plan and was added back to the spec.** A person
may follow at most 200 people. It is user-visible — a 201st follow is refused —
and it comes from the Following feed's fan-out bound rather than a product
preference. A limit a reader cannot find in the spec is a limit they meet as a
bug.
