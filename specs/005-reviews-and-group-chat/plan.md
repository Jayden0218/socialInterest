# Implementation Plan: place reviews and group conversations

**Branch**: `claude/spec-kit-integration-juhrza` | **Date**: 2026-09-07 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-reviews-and-group-chat/spec.md`

## Summary

Two capabilities the owner added back after 004 excluded them by decision.

**Ratings and reviews on a place** extend machinery that already exists: places, reporting
with a typed subject, the moderation queue and its append-only log, and blocking. The work
is a new entity, an aggregate maintained transactionally on the place item, and two entries
in an enum. It is smaller than it reads.

**Group conversations** replace machinery that already exists, and that is the whole of the
risk. `conversationIdFor` hashes a sorted pair of user ids; that derivation is what makes
opening a conversation idempotent with no uniqueness item and no race, and **it cannot
survive a membership change**. Conversation state moves from the conversation to the
participant for the same reason: a group has no single state that is not a lie about at
least one member.

Sequencing follows that asymmetry: ratings (P1) and reviews (P2) ship first because they are
additive and independently valuable; groups (P3) last because they modify a working system
and must prove they did not break it.

## Technical Context

**Language/Version**: TypeScript 5.x on Node 22. Unchanged.

**Primary Dependencies**: NestJS (API), Expo SDK 54 / React Native 0.81 (mobile), AWS SDK v3
DynamoDB client against DynamoDB Local, MinIO for object storage. All unchanged; this
feature adds no dependency.

**Storage**: The existing single DynamoDB table with GSI1–GSI5. This feature adds item types
and access patterns but **no new index** — see data-model.md, where each new pattern is
mapped onto an existing one.

**Testing**: Jest for API, mobile and workers; `apps/e2e` driving the app's own data layer
over HTTP; Playwright browser cases; Maestro flows on an Android emulator in CI.

**Target Platform**: Android (verified — 17/17 journeys, run 29), iOS (never run), web via
react-native-web for the browser cases.

**Project Type**: pnpm monorepo — `apps/api`, `apps/mobile`, `apps/workers`, `apps/e2e`,
`infra`, `packages/shared`.

**Performance Goals**: A place page including its rating summary and first page of reviews
within the budget the place page already meets. Group message delivery p95 no worse than the
pair case measured in 004 (p50 39ms, p95 51ms at 200 concurrent waiters).

**Constraints**: Local profile only — DynamoDB Local, MinIO and ffmpeg in Docker, no cloud
account, no credentials. `TransactWriteItems` caps a membership change at 100 items, which
is why the participant cap is enforced server-side (research R3).

**Scale/Scope**: 3 user stories, 34 functional requirements, 12 success criteria. Estimated
one new top-level concern (ratings), one substantial modification (conversations), and
roughly a dozen new files across API and mobile.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design. Result of the
re-evaluation is at the end of this section.*

### I. Interest Is the Organising Principle (NON-NEGOTIABLE) — **ENGAGED**

Neither reviews nor group conversations may reach a feed. The risk is not hypothetical: a
review is author-attributed content about a place, and a place is the entity 004 was careful
to define as "a Post's relationship, minus feed membership". "Show me reviews from people I
follow" is exactly the convenience that turns this product into a follower feed.

**Compliance**: `FeedService` must not read the rating or review repositories, and the
existing structural guard is extended rather than a new behavioural test written.
`tests/unit/feed-does-not-read-place-follows.spec.ts` already fails if `FeedService` imports
`PlaceFollowRepository`; it gains the review and rating repositories. That test fails when
the *dependency* appears, which is earlier than any behavioural test can catch it.

### II. Visibility Is Decided Once (NON-NEGOTIABLE) — **ENGAGED**

Reviews are a new kind of readable, author-attributed content, and the place page is an
existing enumerated surface that will now return them.

**Compliance**: research R4. Reviews are decided inside `visibility/` through a second entry
point, with the block resolution extracted so both entry points call **one** function.
The visibility matrix contract gains review rows and the surface list gains the review
surface; `surface-routing.spec.ts` must prove the review path consults the boundary rather
than holding its own rule — the matrix alone cannot, because every row runs the same
`decide()`.

**Note on scope**: Principle II's binding text says "all *post* reads". A review is not a
post, so this is compliance with the principle's intent rather than its letter — and the
plan chooses the stricter reading deliberately.

### III. Privacy Guarantees Are Enforced Server-Side — **ENGAGED**

Three guarantees here can be given away by a helpful server:

1. **FR-023a / SC-012** — the refusal when adding a blocked person must not disclose that a
   block exists, who it involves, or its direction. A refusal that differs only in wording
   still leaks it, which is why SC-012 compares refusals as literal responses.
2. **FR-031 / SC-010** — the participant cap must hold against a request that bypasses the
   app, not merely against a disabled button.
3. **FR-013 / SC-004** — a blocked person's review must be absent in both block directions,
   verified through the path a modified client would take.

**Compliance**: all three are tested through `apps/e2e`'s negative journeys, which issue raw
requests rather than driving the generated client.

### IV. Safety Ships With the Product — **ENGAGED**

Reviews and group names are user-generated text, which the principle explicitly names as
content subject to the same policy and reporting as media.

**Compliance**: reporting and moderation for reviews are inside **US2's own acceptance
scenarios**, not a later story. This is a deliberate structural choice: 001 had safety as
US6, which was correct there because it covered the whole product, but a separate safety
phase for a new content type is precisely the scheduling this principle forbids. Gate G2
below makes it a release condition rather than an intention.

### V. Emulation Is Not Evidence — **NOT NEWLY ENGAGED**

Group delivery reuses the existing long-poll and durable event bus. That is already
registered as divergence `D-004-1`, `Verified: no`, and every reason the entry exists is
untouched by participant count (research R10). **No new divergence is registered**, because
adding one for the same fact would lengthen the register without making it more true.

The open question `D-004-1` names — whether a hosted deployment can hold these connections —
stays open, and this feature does not narrow it.

### Cost and Environment Constraints — **SATISFIED**

Nothing here provisions anything. The feature runs entirely on the local profile. The
datastore decision remains open and deferred by the owner; nothing in this plan depends on
resolving it, and nothing in it should be read as pre-committing to an answer.

### Development Workflow and Quality Gates — **SATISFIED**

Spec precedes plan precedes tasks. The one decision with no safe default (FR-023) was put to
the owner rather than assumed, and answering it produced a requirement the question did not
contain (FR-023a). Eight assumptions are recorded in the spec. The visibility matrix
addendum is a contract, so its test is written before the implementations it governs.

### Post-design re-evaluation

Re-checked after data-model.md and contracts/ were written. **No violations.** Two things
changed during design and are recorded rather than smoothed over:

- R4's first draft pushed reviews through `decide()` by inventing `visibility: 'public'` and
  `processingState: 'ready'`. That would have satisfied Principle II's letter while
  committing the field-invention defect this codebase has shipped seven times. The second
  entry point with shared block resolution satisfies both.
- R2 was not a design choice but a consequence of reading the existing repository comment.
  It moves an authority, which is the kind of change that invalidates prior artifacts —
  hence gate G1 and SC-008's migration wording.

**Complexity Tracking is empty**: no principle is violated, so nothing requires
justification.

## Gates

Ordering constraints that are not merely dependencies. Each blocks work that would otherwise
look ready.

- **G1 — the conversation identity and state migration land before any group feature.**
  US3 cannot begin with "add a participants array". R1 (dual id scheme) and R2 (state moves
  to the participant) change how every existing conversation is read, and SC-008 must pass
  against rows written by the *previous* version before anything is built on top. A group
  feature built over an unmigrated model would work in every new test and break every
  existing conversation.

- **G2 — US2 does not ship without review reporting and moderation.** Principle IV. Reviews
  reaching a place page without a report path is not a smaller release, it is an
  unshippable one.

- **G3 — the Principle I guard is extended before the review read path exists.** The
  structural test that fails when `FeedService` gains a rating or review dependency must be
  in place first. Adding it afterwards means it can only confirm what is already true rather
  than prevent what might not be.

- **G4 — the visibility matrix addendum is written before the review read path.** It
  declares itself a contract, and the constitution requires a contract's test to exist
  before the implementations it governs.

## Project Structure

### Documentation (this feature)

```text
specs/005-reviews-and-group-chat/
├── plan.md                  # This file
├── spec.md
├── research.md              # R1-R10
├── data-model.md
├── quickstart.md
├── checklists/requirements.md
├── contracts/
│   ├── openapi-delta.yaml
│   └── visibility-matrix-addendum.md
└── tasks.md                 # /speckit-tasks output, not created here
```

### Source Code

```text
apps/api/src/
├── visibility/
│   ├── visibility.filter.ts          # MODIFIED: extract shared block resolution
│   └── authored-content.ts           # NEW: the second entry point (R4)
├── ratings/                          # NEW: ratings and reviews, US1 + US2
│   ├── rating.service.ts
│   ├── review-query.service.ts       # the ONE responder for review shape
│   └── ratings.module.ts
├── conversations/
│   ├── conversation-id.ts            # MODIFIED: pair derivation stays, groups get ULIDs
│   └── conversation-access.ts        # MODIFIED: membership set, not a pair
├── modules/
│   ├── places/place.controller.ts    # MODIFIED: rating summary, review list
│   ├── conversations/                # MODIFIED: create/add/leave, per-participant state
│   ├── safety/safety.controller.ts   # MODIFIED: two enum entries
│   └── moderation/moderation.controller.ts  # MODIFIED: two remove_content branches
├── persistence/
│   ├── rating.repository.ts          # NEW
│   ├── conversation.repository.ts    # MODIFIED: N participants, state authority moves
│   └── keys.ts                       # MODIFIED: new key builders
└── scripts/backfill-conversation-state.ts   # NEW: R9

apps/api/tests/
├── visibility/
│   ├── matrix.spec.ts                # MODIFIED: review rows
│   ├── surfaces.ts                   # MODIFIED: the review surface
│   └── surface-routing.spec.ts       # MODIFIED: review path consults the boundary
├── unit/feed-does-not-read-place-follows.spec.ts  # MODIFIED: G3
└── integration/conversation-migration.spec.ts     # NEW: SC-008

apps/mobile/src/
├── features/places/                  # MODIFIED: rating control, review list, review compose
├── features/conversations/           # MODIFIED: group creation, participants, leave
└── screens/index.tsx                 # MODIFIED: containers (single-owner file)

apps/e2e/journeys/                    # NEW: ratings, reviews, groups
.maestro/                             # NEW: 20-rate-place, 21-group-chat
```

**Structure Decision**: the existing monorepo layout, unchanged. Ratings get their own
top-level module in the API rather than living inside `places/`, for the same reason
`VisibilityFilter` is top-level (001/D6): a rating is written from the place page but is not
a property of a place, and the aggregate it maintains is the one thing on the place item
that another module writes.

## Single-owner files

Two agents editing these will overwrite each other. Same rule as 001, 002 and 004; different
set.

| File | Why |
|---|---|
| `apps/api/tests/visibility/matrix.spec.ts` | Every story that adds a surface wants to add rows |
| `apps/api/src/visibility/visibility.filter.ts` | R4's shared block extraction touches the one function both entry points use |
| `apps/api/src/persistence/keys.ts` | Both stories add key builders |
| `apps/api/src/persistence/conversation.repository.ts` | R1, R2 and R9 all land here |
| `apps/mobile/src/screens/index.tsx` | Every container lives here |
| `apps/api/src/modules/places/place.controller.ts` | US1 and US2 both extend it |
| `docs/verification/divergence-register.md` | `verify:register` checks it; two writers will disagree |
| `.github/workflows/ci.yml` | Every phase wants to add a step |

## Parallelisation

US1 → US2 is a genuine dependency: a review is text attached to a rating, so US2 cannot
precede US1. US3 is independent of both and is the natural second lane — but G1 means its
first tasks are migration and identity work, which are not parallel with anything because
everything else in that story waits on them.

Realistically this is **two lanes** (ratings/reviews, and conversations) with a serial
prologue in each. Per the sizing note in CLAUDE.md, that does not justify more than two
agents, and the shared files above make more than two actively harmful.

## What this plan does not settle

Stated here rather than discovered later:

- **Whether a hosted deployment can hold group long-polls.** `D-004-1`, still open, and this
  feature does not narrow it.
- **The datastore.** Deferred by the owner. Worth restating the cost this feature adds: D9
  gives the datastore no adapter by design, so every repository is written directly against
  DynamoDB's API. 004 added five repositories; this adds one more and substantially rewrites
  another. The price of switching rises with each one.
- **iOS.** Nothing has ever run there, and nothing here changes that.
- **Whether people write reviews.** The same real-usage question every prior feature leaves
  open. A journey that writes a review measures the journey.
