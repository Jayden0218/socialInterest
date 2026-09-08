<!--
Sync Impact Report
==================
Version change: 1.0.0 → 2.0.0
Rationale: MAJOR. Principle I, marked NON-NEGOTIABLE, is REDEFINED — not clarified.
The project owner decided on 2026-09-08 that the home feed is RANKED FROM BEHAVIOUR
(one blended stream, no interest sections) rather than composed from the interests a
person follows. Under the governance rules below a NON-NEGOTIABLE principle is changed
by explicit amendment or not at all; this is that amendment.

Principles modified:
  I.  Interest Is the Organising Principle  →  Interest Is the Unit of Meaning
      (NON-NEGOTIABLE in both versions; the guarantee changed, the standing did not)
  II. Visibility Is Decided Once — STRENGTHENED, not weakened. A new clause states
      that ranking selects CANDIDATES and the visibility boundary still decides at
      read time. Added because a ranked feed is exactly the change that tends to
      quietly acquire its own visibility predicate.
  III. Privacy Guarantees Are Enforced Server-Side — new clause on BEHAVIOURAL
      SIGNALS, because the ranked feed collects dwell time, which the product did not
      previously collect at all.

Principles unchanged: IV (Safety Ships With the Product), V (Emulation Is Not Evidence).
Sections added: none. Sections removed: none.

WHAT THIS AMENDMENT INVALIDATES, and how it is brought into line
----------------------------------------------------------------
The old Principle I required that a person-follow never widen a viewer's feed beyond
their followed interests. A ranked feed has no such boundary, so the following are
invalidated and MUST be resolved by the feature that implements the ranked feed:

  · 001/FR-033 (person-follow must not widen the feed) — WITHDRAWN. The requirement
    describes a subscription feed that no longer exists.
  · apps/api/tests/integration/us4-fr033-boundary.spec.ts — the negative test that
    enforced FR-033. It MUST be deleted, not adjusted: a weakened version of it would
    assert a boundary the product no longer has and would read as coverage.
  · apps/e2e/journeys/feed.spec.ts and apps/e2e/scripts/seed-fr033-fixture.ts — the
    journey and fixture built on the same boundary.
  · 001/SC-006 and 001/US4 — the user story and criterion stated in those terms.
  · apps/api/src/modules/feed/feed.service.ts and ranking.ts — the read-time feed
    composed from followed interests.
  · specs/001-interest-media-sharing/{spec,plan}.md — the feed-composition
    requirements and the Constitution Check written against version 1.0.0.
  · CLAUDE.md — the D1 note describing read-time assembly as feed COMPOSITION.

Deletion of a guard is the dangerous half of this amendment. It is permitted here only
because the guarantee it enforced has been withdrawn deliberately and in writing. Any
guard whose principle still stands MUST NOT be removed on the strength of this note.

Deliberately NOT changed: D1 (read-time assembly). It was forced by FR-017 + SC-009 —
a visibility change must land on every surface immediately — and that requirement is
untouched. Ranking may precompute CANDIDATES; it may not precompute what a viewer is
allowed to see.

Follow-up TODOs:
  - The feature implementing the ranked feed MUST carry the withdrawals above as
    explicit tasks. An invalidated requirement that is merely ignored is worse than one
    that is deleted, because it still reads as a promise.
-->

# socialInterest Constitution

## Core Principles

### I. Interest Is the Unit of Meaning (NON-NEGOTIABLE)

Every post MUST be filed under at least one interest. Publishing without one MUST fail;
there is no "uncategorised". The interest is the dimension the product reasons over —
what a ranking learns from, what a person browses by, and what a report or a moderation
decision is scoped to.

Interests MUST remain first-class surfaces, not metadata. An interest space listing that
interest's posts, search by interest, and the interest shown on a post MUST all remain
reachable and complete. The ranked home feed is ONE surface among these, never the only
way to reach content.

A person MUST be able to see what their feed is built from, and to reset it. A ranking
that cannot be inspected or reset is not permitted by this constitution.

**Rationale**: Version 1.0.0 of this principle made the interest the STRUCTURE of the
home feed and forbade a person-follow from widening it. The project owner replaced that
with a ranked feed on 2026-09-08, and the honest consequence is that the old guarantee is
gone rather than reworded.

What remains non-negotiable is that interests stay LOAD-BEARING. The failure mode this
clause exists to prevent is specific and observable: once a feed ranks well, the interest
becomes a tag nobody navigates, then a tag nobody sets, then a column nobody reads — and
the product is an ordinary media feed with a vestigial taxonomy. Requiring every post to
carry one, requiring the interest surfaces to stay complete, and requiring the ranking to
be inspectable and resettable are the three things that keep that from happening quietly.

The reset requirement is not a courtesy. A feed learned from behaviour that a person can
neither see into nor correct leaves abandoning the account as the only remedy.

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

**Ranking selects candidates; the boundary decides.** A ranker, recommender, or any other
ordering mechanism MAY choose which posts are considered and in what order. It MUST NOT
determine whether a viewer may see one. Every ranked result set MUST pass through the same
visibility boundary, at read time, before it reaches a viewer. A ranking pipeline that
filters for visibility itself — or that serves a precomputed set assembled before the
viewer was known — is a second visibility predicate and is prohibited by this principle.

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

**Behavioural signals are personal data.** Where the product records what a person opens,
how long they stay, or what they save in order to rank what they see next, that collection
MUST be disclosed somewhere a person can find without being told where to look, and MUST be
resettable by them. Such signals MUST NOT be readable by another person through any surface,
and MUST NOT be inferable from a public count, ordering, or aggregate.

**Rationale**: A client-side strip is a courtesy, not a guarantee. The distinction only
shows up under a client that skips it, which is exactly the client that will exist.

Behavioural signals are covered here rather than in a separate principle because they are
the same failure: a guarantee the client cannot be trusted to keep. The product did not
collect them at all before 2026-09-08, so this clause is new obligation, not restated
practice.

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

**Version**: 2.0.0 | **Ratified**: 2026-09-05 | **Last Amended**: 2026-09-08
