# Specification Quality Checklist: Email and Password Identity

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-14
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

## What the validation pass actually changed

A checklist of ticks nobody had to earn is decoration. Three things were wrong on the first
pass and were fixed before these boxes were marked:

1. **FR-009 said the refusal "MUST NOT reveal whether an account exists".** That is a
   guarantee a reader cannot test, because the obvious implementation — one shared message —
   satisfies the words while a faster code path for an unknown address gives the answer
   away. It now names all three channels: message, status, **and elapsed time**, and SC-004
   measures the third rather than trusting it.

2. **US4 had no requirement covering its own absence.** The spec deferred password reset to
   a separate slice and then said nothing about the months in which it does not exist — so
   the app would carry a "Forgot password?" control leading nowhere, which is the
   declared-half-with-no-other-half shape this project has recorded seven times. FR-022 now
   forbids presenting the control before it works.

3. **Nothing said a reset invalidates outstanding credentials.** Reset is what somebody does
   when they believe they have been compromised, and a reset that leaves the attacker's
   session alive is a reset that solves nothing. FR-021 was added, and it is the reason the
   long-lived-credential assumption is acceptable.

## Zero clarification markers, and why that is a claim rather than a shortcut

The template permits three. None are used, which is only defensible if every gap was closed
by a decision rather than by omission — so each one is written down in **Assumptions** with
its cost stated, not just its choice:

- email verification: not required to use, required to reset — **and the consequence is
  stated**, that an account may hold an address its owner never agreed to
- session model: one long-lived credential — **and the cost is stated**, that a stolen one
  is useful for its whole life, which is what FR-021 answers
- existing device-token accounts: keep working, cannot be adopted
- password floor: 10 characters, no composition rules, with the reasoning

An assumption recorded with its downside is a decision. One recorded as a preference is a
gap wearing a tick.

## Notes

- Items marked incomplete require spec updates before `/speckit-clarify` or `/speckit-plan`
