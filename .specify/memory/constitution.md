<!--
Sync Impact Report
==================
Version change: (none) → 1.0.0
Rationale: Initial ratification. The file was previously the unfilled scaffold with 20
placeholder tokens and zero normative statements, so no prior version existed to bump.

Principles defined (all new):
  I.   Interest Is the Organising Principle (NON-NEGOTIABLE)
  II.  Visibility Is Decided Once (NON-NEGOTIABLE)
  III. Privacy Guarantees Are Enforced Server-Side
  IV.  Safety Ships With the Product
  V.   Emulation Is Not Evidence

Sections added:
  - Cost and Environment Constraints (from the deferred-AWS decision of 2026-09-05)
  - Development Workflow and Quality Gates
  - Governance

Sections removed: none.

Provenance: every principle is derived from a decision already recorded in
specs/001-interest-media-sharing/ (spec.md, plan.md, research.md D1/D6/D9, and
contracts/visibility-matrix.md). Nothing here is aspirational boilerplate.

Deliberately NOT adopted: a blanket test-first (TDD) mandate. The existing task list
writes tests first only where they define a contract. A universal TDD principle would
invalidate that ordering across 172 tasks without a decision having been made. Raise it
as an amendment if wanted.

Follow-up TODOs:
  - specs/001-interest-media-sharing/plan.md § Constitution Check records "no gates
    defined" and is now stale. It MUST be re-evaluated against this document before
    /speckit-implement. Out of scope for /speckit-constitution, which writes only this file.
-->

# socialInterest Constitution

## Core Principles

### I. Interest Is the Organising Principle (NON-NEGOTIABLE)

Content is organised by interest, never by a social graph. Every post MUST be filed under
at least one interest. A person's home feed MUST be composed from the interests they
follow; posts by a followed person MUST reach that feed only inside interests the viewer
also follows.

Following a person MUST NOT introduce content from an interest the viewer has not chosen.
Any change that would let a person-follow widen a viewer's feed beyond their followed
interests is a violation of this principle, not a product tweak.

**Rationale**: This is the product's identity and its only real differentiator. The
failure mode is silent — a ranking change or a "just show more from people you follow"
convenience turns the product into an ordinary follower feed, and nobody notices until
the interest structure is vestigial. Requiring a test that asserts the negative case
(FR-033) is what keeps this honest.

### II. Visibility Is Decided Once (NON-NEGOTIABLE)

All post reads MUST pass through a single visibility boundary that takes the viewer and a
candidate set and returns only what the viewer is permitted to see. No read path may
construct its own visibility predicate. Share links, notifications, search results, and
feeds are read paths and are bound by this rule.

A change to a post's visibility MUST take effect on every surface immediately. Designs
that require visibility to be re-applied to stored copies (materialised timelines, cached
result sets that outlive a visibility change) MUST NOT be introduced without amending
this principle first.

Every surface that can return a post MUST be enumerated in the visibility contract test.
Adding a surface without adding it to that test is an incomplete change.

**Rationale**: Six independently written predicates give six chances to leak, and the
leak is silent and privacy-affecting. One implementation with a generated matrix turns a
success criterion into a test rather than an intention. This principle is also why the
feed is assembled at read time — the architecture follows from the guarantee, not the
other way round.

### III. Privacy Guarantees Are Enforced Server-Side

Any guarantee made to a person about their data MUST be enforced where the client cannot
bypass it. Location and other identifying metadata MUST be stripped by the server before
media becomes readable by anyone; media that has not been through that step MUST NOT
reach a reader.

Tests for such guarantees MUST exercise the path a modified or hostile client would take.
A test that only drives the well-behaved first-party client does not verify a server-side
guarantee and MUST NOT be treated as covering one.

**Rationale**: A client-side strip is a courtesy, not a guarantee. The distinction only
shows up under a client that skips it, which is exactly the client that will exist.

### IV. Safety Ships With the Product

Any release exposed to people who did not build it MUST include reporting, blocking, and
a moderation path with a human decision-maker. User-generated names and text are content
and MUST be subject to the same policy and reporting as media.

Moderation decisions MUST be recorded in an append-only log that survives deletion of the
subject.

Safety work MUST NOT be scheduled as polish, deferred to "after launch", or cut to make a
date. A working feature set without these controls is not a shippable product for an
application that accepts user-uploaded media.

**Rationale**: Safety deferred is safety cancelled — it competes with features forever
and loses, until an incident reorders the backlog. Naming it a release gate rather than a
phase is what prevents that.

### V. Emulation Is Not Evidence

Where a local stand-in and a production service are different implementations rather than
emulations of one another, a passing local test MUST NOT be reported as evidence that the
production path works. Such divergences MUST be named explicitly in the design record,
and each MUST have a stated plan to verify the production path before launch.

Where a local tool speaks the same API as its production counterpart, this principle does
not apply and no adapter should be invented to separate them.

**Rationale**: The dangerous case is the one that looks covered. A green suite against a
different implementation reads exactly like a green suite against the real one, and the
difference surfaces in production.

## Cost and Environment Constraints

**No task may provision billable cloud resources without explicit, specific approval from
the project owner.** Approval for one deployment is not approval for the next.

Every functional task MUST be completable on the local runtime profile — containers on a
developer machine or a disposable sandbox, with no cloud account and no credentials.
Infrastructure-as-code MAY be written and validated with a synth or plan step that
requires no account; applying it is a separate, explicitly approved action.

Continuous integration MUST run the full test suite without cloud credentials. A test that
cannot run in CI for want of a cloud account is not a test the project relies on.

Where a managed service is named in a design document, it is a deferred placeholder unless
the document says a deployment decision has been made. Design documents MUST make this
explicit at the point the service is named, not only in a section further down.

**Rationale**: Recorded at the project owner's direct request on 2026-09-05. Beyond cost,
the discipline is what keeps the feedback loop fast: the code most likely to be wrong
should not be behind the slowest and most expensive way to run it.

## Development Workflow and Quality Gates

**Specification precedes implementation.** Work flows spec → plan → tasks → implementation.
A requirement MUST exist before the code that satisfies it, and each task MUST trace to a
requirement, a success criterion, or a recorded design decision.

**Ambiguity is resolved, not guessed.** Where a decision has no safe default and would
materially change scope, privacy, or user experience, it MUST be put to the project owner
rather than assumed. Assumptions that are made MUST be written down where the work records
them.

**Tests that define a contract are written first.** Where a document declares itself a
contract, the test that enforces it MUST exist before the implementations it governs.
Other tests may follow implementation. This project does not mandate test-first for all
code; it mandates it for contracts.

**Success criteria are measured, not asserted.** A stated numeric criterion MUST have a
task that measures it. A criterion with an implementation but no measurement is not met,
it is merely attempted.

**Honest reporting.** Failing tests, skipped steps, and unverified claims MUST be reported
plainly. "It should work" is not a result. A design decision that turns out to be wrong is
recorded and corrected, not quietly reinterpreted.

## Governance

This constitution supersedes other practices and conventions where they conflict. Where it
is silent, the design documents in `specs/` govern.

**Amendment procedure.** Amendments MUST be made by editing this file with an updated Sync
Impact Report recording what changed and why. An amendment that removes or redefines a
principle MUST state which existing artifacts it invalidates and how they will be brought
into line. Principles marked NON-NEGOTIABLE MUST NOT be diluted by reinterpretation; they
are changed by explicit amendment or not at all.

**Versioning policy.** Semantic versioning applies to this document. MAJOR for a
backward-incompatible removal or redefinition of a principle; MINOR for a new principle or
materially expanded guidance; PATCH for clarification and wording.

**Compliance review.** Every plan MUST evaluate itself against this document in its
Constitution Check section and record the result, including the finding that no principle
is engaged. Violations MUST be either corrected or justified in writing in the plan's
Complexity Tracking table; an unjustified violation blocks implementation. A plan written
before an amendment MUST be re-evaluated against the amended document before further
implementation proceeds.

**Version**: 1.0.0 | **Ratified**: 2026-09-05 | **Last Amended**: 2026-09-05
