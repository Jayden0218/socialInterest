# Implementation Plan: Conversations, places, and the depth the product is missing

**Branch**: `claude/spec-kit-integration-juhrza` | **Date**: 2026-09-06
**Spec**: [`spec.md`](./spec.md)
**Input**: Feature specification from `specs/004-chat-places-and-depth/spec.md`

## Summary

Five stories, in the owner's stated priority: **conversations** (the chat page),
**places** (the restaurant page), **interest pages with depth**, **two holes in scope that
001 declared complete and did not deliver**, and **saved posts**.

The technical approach is deliberately conservative, because the product's short history is
a list of defects that a green test suite could not see. Chat is delivered over the existing
HTTP server by long-polling resolved through the existing durable event bus — no second
protocol, no new native dependency, and every assertion stays an HTTP request that
`apps/e2e` can make (research R1, R6). Places reuse the Post–Interest index item shape
exactly, so the new post surface is one row in the visibility contract rather than a new
class of test (R9). One new GSI. Five new repositories.

Two things this plan says out loud rather than burying:

- **`003/datastore-decision.md` is open, and this feature is the wrong thing to build in
  front of it.** Five new repositories on top of thirteen is roughly a 40% increase in
  whatever migration that decision implies, and R4 identifies work (proximity search) that
  the two candidate datastores price completely differently. Recorded as a gate below.
- **Chat is the feature most likely to quietly become the product.** Constitution I is
  non-negotiable and its failure mode is silent. FR-012 forbids the specific mechanism and
  exists to be tested negatively.

## Technical Context

**Language/Version**: TypeScript 5.x, Node 20 — unchanged.

**Primary Dependencies**: NestJS (API), Expo SDK 54 / React Native 0.81 (mobile),
`@aws-sdk/client-dynamodb`, Jest, Maestro. **No new runtime dependency is introduced by this
feature** — see research R1 and R6 for why that is a decision rather than an accident.

**Storage**: The existing single DynamoDB table via DynamoDB Local. One new index (**GSI5 —
Inbox**). Five new repositories. **The datastore selection is formally pending**
(`specs/003-device-and-hosting/datastore-decision.md`); every mention of DynamoDB in this
plan is therefore the incumbent, not a settled choice.

**Testing**: Jest unit and integration in `apps/api`; the generated visibility matrix
(`apps/api/tests/visibility/matrix.spec.ts`); `apps/e2e` journeys driving
`apps/mobile/src/data` over HTTP; Maestro flows on the Android emulator in CI.

**Target Platform**: Android (verified, 10/10 journeys as of 2026-09-06). iOS remains
entirely unverified and this feature does not change that.

**Project Type**: Mobile app + API, pnpm workspace.

**Performance Goals**: SC-001 — a message readable by the other participant within 2 s with
the conversation open. Long-polling makes the expected case sub-second. Everything else
inherits 001's targets.

**Constraints**:
- `local` runtime profile only. `RUNTIME_PROFILE` accepts nothing else.
- No billable cloud resource without explicit, specific approval.
- One in-flight long-poll per open conversation. Against a datastore measured at **882
  req/s** (003/R1) this is the design's whole margin, and it is why fixed-interval polling
  was rejected.

**Scale/Scope**: 44 functional requirements, 14 success criteria, 5 user stories. Estimated
~9 new API modules/services, 5 repositories, 7 new mobile routes, 1 new tab.

**Unknowns**: none marked NEEDS CLARIFICATION. Every open question in the request was
resolved in `research.md` with its alternatives recorded. Two items are **decisions for the
owner, not unknowns for research**, and are stated as gates below.

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1 design. Result: **PASS with
four principles actively engaged and mitigated**. No violation requires justification, so
Complexity Tracking is empty.*

### I. Interest Is the Organising Principle (NON-NEGOTIABLE) — **engaged twice**

| Hazard | Mitigation | Verified by |
|---|---|---|
| A place-follow widens the home feed beyond followed interests — the exact shape of the thing 001/FR-033 was written to prevent | **FR-019**: posts reach the feed by way of a followed place only inside interests the viewer also follows. The feed's candidate assembly never reads a Place Follow item; the data model says so at the item's definition, because the item existing is what would tempt a later change to consult it. | **SC-006**, a negative assertion in the same shape as 001/FR-033's test |
| Chat becomes the reason people open the app and the interest structure goes vestigial | **FR-012**: a conversation must not contribute to, reorder, or widen any feed, interest space, place page, or profile, and message activity must not influence ranking anywhere. | A negative test asserting message activity changes no feed's contents or order |
| A "Top" ordering silently changes which posts are shown | **FR-028**, and research R7: `top` reorders the set `new` returns, after the visibility filter. There is no second query. | **SC-009**, identical id sets |

**Assessment**: PASS. Both new surfaces are browse surfaces, not feed sources. The single
sentence that keeps this true is in research R3: *a Place is to a Post what an Interest is,
minus feed membership* — and FR-019 is where the "minus" is enforced.

### II. Visibility Is Decided Once (NON-NEGOTIABLE) — **engaged**

Four new post read paths: the place page, the saved list, a post shared into a conversation,
and in-interest post search. All four are added to the surface list in
`contracts/visibility-matrix-addendum.md`, taking the generated matrix from 294 to **462**
assertions (**SC-005**). No new predicate is written; the generator is unchanged and the
surface list is data — which is exactly the growth path 001's contract specified.

Two sub-cases are called out because each invites a shortcut:

- **A saved post is a bookmark, not a copy.** "They saved it, so they could see it" is wrong
  precisely when it matters (FR-039, SC-013).
- **A shared post inside a message is two decisions, not one.** The conversation boundary
  does not substitute for the post boundary. `Message.sharedPostId` is stored as a reference
  and resolved per reader, never as a denormalised snapshot — a snapshot would be a
  materialised copy outliving a visibility change, which this principle forbids introducing
  without an amendment.

**Extension, not exception**: conversation membership is a read path this principle does not
cover, because a conversation is not a post. Its *rationale* covers it exactly, so
`ConversationAccess` is a single boundary with its own generated table (60 assertions),
mirroring `VisibilityFilter` (FR-041, research R2). This is applying the principle's
reasoning to new ground, and it is recorded here rather than left implicit.

**Assessment**: PASS.

### III. Privacy Guarantees Are Enforced Server-Side — **engaged**

001/FR-010 requires the server to strip embedded location from uploaded media. This feature
introduces a field that discloses location on purpose. **FR-021** forbids the two from
meeting: no write path may derive, suggest, or attach a place from media metadata. **SC-008**
tests it by publishing media carrying EXIF GPS and asserting no place on the result — through
the path a hostile client would take, not the well-behaved one.

People search (FR-035) excludes blocks in both directions server-side, tested the same way.

**Assessment**: PASS.

### IV. Safety Ships With the Product — **engaged, and it is the reason US1 is not P1 alone**

Three new content types arrive here: message bodies, place names, interest descriptions. All
three are reportable and moderatable **in the same release that introduces them** (FR-042),
through the existing queue and the existing append-only audit log.

Chat's specific abuse vector — the unsolicited first message — is addressed at arrival by the
request inbox (FR-003 to FR-005, research R5) rather than after a report. Blocks sever
conversations in both directions and are not disclosed (FR-006). Sending is rate-limited
(FR-008).

**Assessment**: PASS. **Release gate**: US1 must not ship without message reporting, the
request inbox, and block severance. They are in the same story, not a later phase — which is
what this principle means by "safety is not polish".

### V. Emulation Is Not Evidence — **engaged**

Long-polling on the local HTTP server is not how a hosted deployment will serve chat.
Registered in `docs/verification/divergence-register.md` (research R1). A green local chat
suite is **not** evidence that a hosted transport works, and must not be reported as one.

Everything else in this feature runs on the same implementation in every environment.

**Assessment**: PASS with a registered divergence.

### Cost and Environment Constraints — **satisfied**

Every requirement is buildable and testable on the `local` profile with no cloud account
(FR-043, SC-014). Nothing here provisions anything. Two capabilities are explicitly
**not claimed** rather than substituted: push notification delivery to a backgrounded device
(needs an account-bound push service) and behaviour at concurrency (003 measured the ceiling
as the emulator).

### Development Workflow and Quality Gates — **satisfied**

`contracts/visibility-matrix-addendum.md` and Part 2's conversation table both declare
themselves contracts, so their generated tests are written **before** the implementations
they govern. Every success criterion has a measurement, not an assertion.

## Gates for the owner — decisions, not research

Neither is a blocker this plan can resolve. Both change what the work costs.

**G1 — Settle the datastore before building this (research R11).** Five new repositories on
top of thirteen. If `003/datastore-decision.md` later selects PostgreSQL, this feature's
persistence is rewritten with the rest. Building first is a legitimate choice if having
something people can use matters more than migration cost; it should be made deliberately.

**G2 — Scope confirmation on two deliberate exclusions.** A place page here shows the posts
filed to it. **Ratings, reviews, opening hours, menus and bookings are out of scope** — each
is a distinct content type with its own moderation and abuse profile, and folding them in as
a subsection of this feature is how safety work gets deferred. **Group chat is out of scope**;
conversation identity is derived from the participant pair (research R8), so groups are a
rewrite of that, not an extra field. If either is wanted, it is a separate spec and this plan
should be told before tasks are generated.

## Project Structure

### Documentation (this feature)

```text
specs/004-chat-places-and-depth/
├── spec.md                                # Stories, 44 FRs, 14 SCs
├── plan.md                                # This file
├── research.md                            # R1-R11, with alternatives
├── data-model.md                          # A21-A34, GSI5, 7 new item shapes
├── quickstart.md                          # How to prove each story runs
├── contracts/
│   ├── openapi.yaml                       # Delta against 001's contract
│   └── visibility-matrix-addendum.md      # 7 surfaces -> 11; ConversationAccess table
└── tasks.md                               # NOT created by /speckit-plan
```

### Source Code (repository root)

```text
apps/api/src/
├── visibility/                            # UNCHANGED. Surface list grows; no new predicate.
├── conversations/                         # NEW, top level - not under modules/
│   └── conversation-access.ts             #   The single membership boundary (FR-041, R2)
├── modules/
│   ├── conversations/                     # NEW: controller, service, long-poll handler
│   ├── places/                            # NEW: controller, service, catalogue search
│   ├── saved/                             # NEW: controller, service
│   ├── posts/                             # CHANGED: placeId on publish and edit
│   ├── interests/                         # CHANGED: description, order=top, in-interest q
│   ├── people/                            # CHANGED: people search, notification prefs
│   ├── feed/                              # CHANGED: nothing widens it - FR-019's negative test
│   ├── notifications/                     # CHANGED: suppress at creation (R10)
│   ├── moderation/                        # CHANGED: message, place, description subjects
│   └── safety/                            # CHANGED: new report subject types
└── persistence/                           # CHANGED: 5 repositories, GSI5, table definition

apps/mobile/src/
├── App.tsx                                # CHANGED: 5th tab + 7 routes (SINGLE-OWNER FILE)
├── screens/index.tsx                      # CHANGED: new containers (SINGLE-OWNER FILE)
├── data/
│   ├── conversations.ts                   # NEW
│   ├── places.ts                          # NEW
│   └── saved.ts                           # NEW
└── features/
    ├── conversations/                     # NEW: InboxScreen, ConversationScreen, RequestsScreen
    ├── places/                            # NEW: PlaceScreen, PlacePicker, CreatePlaceScreen
    ├── discover/                          # CHANGED: search spans interests AND places
    ├── publish/                           # CHANGED: optional place attachment
    ├── profile/                           # CHANGED: saved list, notification settings
    └── posts/                             # CHANGED: place chip on a post

apps/api/tests/visibility/matrix.spec.ts   # CHANGED: 4 surfaces (SINGLE-OWNER FILE)
apps/e2e/journeys/                         # NEW journeys per story
apps/e2e/support/client.ts                 # CHANGED (SINGLE-OWNER FILE)
.maestro/                                  # NEW flows: chat, place attach, place page
docs/verification/divergence-register.md   # CHANGED: long-poll divergence (SINGLE-OWNER FILE)
```

**Structure Decision**: the existing workspace layout is kept exactly. `conversation-access.ts`
sits at the **top level** rather than inside `modules/conversations/` for the same reason
001/D6 put `VisibilityFilter` at the top level rather than in `posts/` — a boundary that lives
inside the module that uses it becomes a helper, and a helper gets inlined.

## Single-owner files

Five files this feature will make contested if it is parallelised. Two agents editing any of
these overwrite each other:

| File | Why |
|---|---|
| `apps/mobile/src/App.tsx` | Every new route and the fifth tab land here |
| `apps/mobile/src/screens/index.tsx` | Every container lives here |
| `apps/api/tests/visibility/matrix.spec.ts` | Four surfaces, four stories |
| `apps/api/src/persistence/*post*repository*` | The place index item widens an existing transaction |
| `docs/verification/divergence-register.md` | `verify:register` checks it |

## Complexity Tracking

*No Constitution Check violation requires justification. This table is intentionally empty.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| — | — | — |

## Risk this plan is designed around

**The recurring defect in this codebase is a screen that works and nothing that calls it.**
Four instances so far: `MediaPickerScreen` unreachable, `EngagementBar` never mounted,
`ProfileContainer`'s follow button wired to `() => undefined`, and its post list asking for a
person named `"me"`. Every one passed its own unit test, because a screen test proves the
screen works and says nothing about whether anything calls it.

This feature adds three whole screen families. The mitigation is not more screen tests:
**every story's acceptance is a journey that starts from the app's own entry point** — a tab
tap or a post — and asserts the effect through the service, not the view hierarchy. That is
what found all seven Android defects, and it is the only thing that has ever found one here.

**The second recurring defect is a read path sending `VisibilityFilter`'s candidate rows
instead of a response.** Five instances. Four new post surfaces is four new chances. The
addendum's surface list is the structural answer; the generated matrix is the test.
