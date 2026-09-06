# Specification Quality Checklist: Verified in the cloud, end to end

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

**No [NEEDS CLARIFICATION] markers.** The one candidate — which datastore — is not a
clarification but Story 3 itself, decided inside the feature rather than asked before it.

**One deliberate deviation from the template.** The spec carries a table mapping each item
carried over from 002 to its status under the cloud-only constraint. This is a continuation
feature whose entire purpose is what 002 could not close; a reader cannot judge the stories
without knowing what they inherited, or which of them the constraint rules out. The
functional requirements and success criteria are kept clean of it.

**Revision 2026-09-06 — owner instruction: everything in the cloud, no physical phone, no
human tester, all performable by the agent.** Re-validated after the rewrite.

The spec was reshaped from eight stories to six. What changed and why:

- **Six stories now depend on nothing outside this repository** (1, 2, 3, 6 can start
  immediately; 4 and 5 depend only on other stories here). Previously six of eight were
  blocked on an owner decision or on resources the agent cannot obtain.
- **Story 2 was reframed rather than dropped.** "Deploy to a public host" needs an account and
  credentials the agent does not have. What it *can* do, and what actually matters for the
  product, is make the stack durable: data survives a restart, events survive a restart, and a
  development-secret token is refused. That is now the story.
- **Real usage is withdrawn, not replaced.** Retention and second-post rate need people. The
  spec says so in *Out of Scope* and FR-017 forbids reporting them from synthetic activity.
  This is the one thing the constraint costs, and it is stated once, plainly, rather than
  worked around.
- **iOS is out of scope** on cost grounds: macOS runner minutes bill at ten times the rate on
  a private repository. FR-018 keeps it reported unverified rather than assumed.
- **A new requirement, FR-003, exists because of how this session went.** Six emulator runs
  failed and not one captured the emulator's own output, so every diagnosis was a guess about
  an invisible failure — including one that was confidently wrong. FR-003 and SC-003 now
  require the runtime's own output from *every* attempt, so a seventh is informative whatever
  it returns.

**The risk this checklist is watching.** An agent-only spec creates pressure to invent
substitutes for what cannot be reached. FR-005 (no inferring Android from the browser),
FR-013 (a stand-in measurement is reported as such), FR-016 (unmeasurable is reported
unverified) and FR-017 (no synthetic usage figures) exist specifically to forbid it, and
SC-012 makes it a criterion.
