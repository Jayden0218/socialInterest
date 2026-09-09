# Implementation Plan: A complete app — reach, depth and control

**Branch**: `claude/spec-kit-integration-juhrza` | **Date**: 2026-09-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-post-reach-and-depth/spec.md`

**Constitution**: **2.0.0** (amended 2026-09-08). Principle II's second clause — *ranking
selects candidates, the boundary decides* — is the section this plan turns on, because two
of this feature's stories look alike and belong on opposite sides of it.

## Summary

Fifteen stories in five phases. **Phase A is the first cut and is planned to be shipped
alone**; B–E are designed here to the point where each decision is settled and each new
item type is placed, so that a later phase cannot quietly contradict an earlier one.

The technical shape is not "build fifteen features". Reading the build changed what the
work is:

- **US1 needs no server change at all.** `PostQueryService.toResponse` already maps every
  media row, presigned, in publication order (`MEDIA#000`, zero-padded, is the sort key).
  Four client call sites read `media[0]` and throw the rest away. US1 is a mobile change.
- **US4's server is already complete.** `PUT /v1/conversations/with/:handle` is idempotent
  over a derived pair id, `POST /:id/messages` accepts `sharedPostId`, and the message
  presenter already resolves the shared post per reader through the visibility boundary.
  US4 is a recipient picker and a share-sheet exit.
- **US5 is bigger than it looks.** `avatarUrl` is emitted on exactly **one** of seven
  profile projections, and there it is the raw storage key (`person.controller.ts:42`) —
  which would 403 for the same reason 006/R4b found for post media. SC-008 ("100% of
  surfaces") therefore needs one profile projection function before it needs an upload.

So Phase A is small, US4 and US5 are re-scoped by evidence rather than by estimate, and the
expensive stories are the ones the spec already marked P2/P3.

**The one decision that governs the rest**: mute and dismissal (US12) go into candidate
selection; private accounts (US13) go into the visibility boundary. The test that separates
them is whether the answer to *may this viewer see this post* changed. Muting someone does
not make their profile unreadable, so mute is not a visibility rule; making an account
private does, on every surface at once, so it is nothing else. Getting this backwards is
the single most likely way this feature breaks Principle II — see research R12/R13.

## Technical Context

**Language/Version**: TypeScript 5.9, Node 22

**Primary Dependencies**: NestJS 11 (API), React Native / Expo SDK 54 (mobile),
`@aws-sdk/client-dynamodb` against DynamoDB Local, MinIO, ffmpeg. **No new runtime
dependency.** No new external service (research R6 explains why post search does not add
one).

**Storage**: DynamoDB single-table (`sih-main`), local profile. New item types only; the
five existing GSIs are sufficient (research R3, R6, R14 each check this explicitly).

**Testing**: jest — `@sih/api` (unit / integration / contract / visibility projects),
`@sih/mobile` (component and structural guards), `@sih/e2e` (journeys over real HTTP;
browser journeys under react-native-web), Maestro flows on the Android emulator in CI.

**Target Platform**: Android, verified on an emulator in CI. react-native-web is a
verification surface, **not** a device — it has no soft keyboard and ignores platform font
scaling, both of which have produced wrong conclusions here before. iOS remains unverified
and out of scope.

**Project Type**: Mobile app + API in a pnpm monorepo.

**Performance Goals**: The Following feed must stay inside the same budget as the ranked
feed — first screen under 2s p95 at the reference volumes. Post search must answer from
bounded partition reads, never a table scan (research R6).

**Constraints**: **No billable cloud resources.** Everything on the local profile; CI green
with no credentials. Post search is the one place this bites a design (R6) and the
resolution is recorded there rather than deferred silently.

**Scale/Scope**: 15 stories, 54 FRs, 17 SCs, 5 phases. Roughly: API touched in 9 of 15
modules, ~7 new item types, ~14 new endpoints, and mobile work on 12 of 20 screens.
**Phase A is 3 stories, 10 FRs and 5 SCs** and is the recommended release boundary.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 — result at the end of this file.*

| Principle | Engaged? | Gate for this feature |
|---|---|---|
| **I. Interest Is the Unit of Meaning** (NON-NEGOTIABLE) | Yes | **G1**: the Following surface and post search are additional surfaces, never replacements — the interest space, the roll-up and typed interest search stay complete and reachable (FR-020 returns posts; it does not retire interest search, and FR-022 routes a miss back to interests and people). **G2**: nothing here makes the interest optional; drafts (FR-037) restore the interest and publishing still fails without one. |
| **II. Visibility Is Decided Once** (NON-NEGOTIABLE) | **Yes, at two points, and they pull opposite ways** | **G3**: every new read path — Following, post search, replies, collections, drafts, the appeal — passes `VisibilityFilter` and is a row in `contracts/visibility-matrix.md` (FR-052, SC-016). **G4**: mute and dismissal are **candidate selection** and MUST NOT enter the boundary; a structural guard fails the build if `VisibilityFilter` imports the mute or dismissal repository. **G5**: private accounts are **the boundary** and MUST NOT be a second filter in any surface; one new candidate field, one new clause, every surface inherits it. **G6**: the post-search term index is a candidate index like `postInterestIndex` — it selects, and it is never consulted to decide. |
| **III. Privacy Enforced Server-Side** | Yes | **G7**: comment edit/delete refusal (FR-029), the private-account boundary (FR-044) and appeal readability (FR-048) are tested through the path a modified client would take, not the first-party one. **G8**: dismissal is a behavioural signal (FR-042) and inherits 007's disclosure and reset — a signal kind that is collected but absent from the disclosure is a Principle III violation, not a gap. **G9**: mute is invisible to its subject (FR-040) and must not be inferable from any count, ordering or aggregate. |
| **IV. Safety Ships With the Product** | **Yes — this feature adds to the safety surface** | **G10**: mute, per-post dismissal and appeals are safety controls and ship with their phase, not after it. **G11**: mentions and collection names are user-generated text and are reportable and moderatable like any other content. **G12**: the appeal is recorded in the append-only moderation log and survives deletion of its subject. |
| **V. Emulation Is Not Evidence** | No new divergence | Nothing here introduces a local stand-in for a managed service. Post search deliberately does **not** add one (R6); if a search backend is ever adopted, this principle applies again and the divergence register gains an entry. |
| **Cost and Environment** | Yes | **G13**: every task completable on the local profile. R6 is the test of this gate and it holds — a term index in the existing table needs no account. |

### Gate result: **PASS**, with three obligations recorded rather than waived

1. **FR-054 is not generally testable, and pretending otherwise would be the same defect
   again.** "Every declared field has a writer" cannot be enforced by a single guard. What
   *can* be enforced is recorded in research R16 and scoped honestly: a response-shape
   fixture asserting each declared optional field is non-null in at least one case (this
   catches `readAt` and `avatarUrl`), and a mobile render guard against a multi-item
   fixture (this catches `media[0]`). Neither catches the general case. Saying so is part
   of the gate.
2. **A person-follow cap is introduced** (research R3, `MAX_FOLLOWED_PEOPLE = 200`). It is
   a product constraint arriving as a consequence of a technical bound, which is the shape
   of decision the constitution requires be written down rather than absorbed. It mirrors
   `MAX_FOLLOWED_INTERESTS` and the same 2s budget.
3. **The spec's own wording is corrected here.** The spec's pattern table calls the
   Following tab "a dead control on the primary surface". It is not: it renders
   `disabled`, with `accessibilityState`, and says so on press — an honest incomplete
   state, deliberately, and the code comment says why. The story stands; the severity
   claim does not. Recorded because overstating one's own evidence is the habit this
   project's records exist to check.

## Project Structure

### Documentation (this feature)

```text
specs/008-post-reach-and-depth/
├── plan.md              # This file
├── research.md          # Phase 0 — 16 decisions
├── data-model.md        # Phase 1 — new item types, keys, access patterns A40+
├── quickstart.md        # Phase 1 — how to verify each phase
├── contracts/
│   ├── visibility-matrix-delta.md   # New surfaces and the two new inputs (Constitution II)
│   ├── selection-vs-boundary.md     # Which side mute/dismissal/privacy fall on, and the guards
│   ├── following-feed.md            # Chronological, unranked, signal-free
│   └── openapi-delta.md             # New and changed endpoints
├── checklists/requirements.md
└── tasks.md             # NOT created by /speckit-plan
```

### Source Code (repository root)

```text
apps/api/src/
├── visibility/
│   ├── visibility.filter.ts          # + authorPrivacy clause (US13). Nothing else changes.
│   └── ...                           # MUST NOT gain mute/dismissal imports (G4)
├── persistence/
│   ├── keys.ts                       # + notificationRead, followingCursor-free reads,
│   │                                 #   postTerm, draft, mute, dismissal, collection,
│   │                                 #   collectionItem, appeal, commentParent
│   ├── notification.repository.ts    # + read watermark
│   ├── post.repository.ts            # + term index writes on publish
│   └── {mute,dismissal,draft,collection,appeal}.repository.ts   # new
├── modules/
│   ├── notifications/                # US2  — watermark, derived readAt, unread count
│   ├── feed/following-feed.service.ts# US3  — new; no signals, no ranking (guarded)
│   ├── people/profile.projection.ts  # US5  — THE one profile projection (new)
│   ├── search/                       # US6  — new module; post term search
│   ├── engagement/comment.service.ts # US7,8,9 — parent, edit/delete, mentions
│   ├── posts/                        # US10,11 — alt text, drafts
│   ├── ranking/candidate-source.ts   # US12 — mute and dismissal applied HERE
│   ├── moderation/appeal.service.ts  # US14 — new
│   └── saved/collection.service.ts   # US15 — new
└── tests/
    ├── visibility/matrix.spec.ts     # + every new surface (SC-016)
    └── unit/selection-not-boundary.spec.ts   # new structural guard (G4)

apps/mobile/src/
├── components/PostCard.tsx           # US1 — count indicator, not per-item navigation
├── components/MediaPager.tsx         # US1 — new; the detail-surface pager
├── features/feed/HomeFeedScreen.tsx  # US3 — the Following tab becomes real
├── features/posts/PostDetailScreen.tsx
├── features/engagement/              # US7,8,9
├── features/publish/                 # US10,11
└── features/profile/                 # US5,13,15

apps/e2e/
├── journeys/                         # per-phase HTTP journeys
└── browser/                          # layout and reachability (SC-017)

.maestro/                             # device flows, one per phase
```

**Structure Decision**: unchanged from 007 — mobile app plus API in a pnpm monorepo. This
feature adds two API modules (`search/`, and appeals inside `moderation/`) and one mobile
component of consequence (`MediaPager`). Everything else lands in modules that exist.

## Delivery order, and what "done" means for each phase

Each phase ends with the same four things, because a phase that skips one of them is how
007 came to report eight phases finished with four tasks undone:

1. the full CI step list green — the real list, not a proxy for it;
2. every new read path present in `contracts/visibility-matrix.md` with **zero skipped
   rows** (SC-016);
3. an Android device run of that phase's Maestro flows, asserted **through the service**
   (status codes in the run's API aggregate), not through the view hierarchy;
4. `tasks.md` boxes actually checked — the checklist is the record.

| Phase | Stories | Ships alone? | Why here |
|---|---|---|---|
| **A** | US1–3 | **Yes — recommended first release** | Only phase that fixes something currently wrong. No new item type except one watermark. Highest value per unit of risk. |
| **B** | US4–6 | Yes | Reach. US4 is client-only, US5 is one projection, US6 is the only story that needs a new index. |
| **C** | US7–11 | Yes | Depth. Largest phase; US7–9 share the comment path and should not be split across releases. |
| **D** | US12–14 | **Must not be split** | Safety and trust. Constitution IV forbids scheduling these as polish; mute without appeals is half a control surface. |
| **E** | US15 | Yes | Retention. Smallest, and depends on nothing in B–D. |

Phase A does not depend on B–E. B, C and E do not depend on each other. **D depends on C**
only for mentions being mutable content; if C slips, D's mute and appeals still stand.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| A new **candidate index** for post text (`TERM#`) | FR-020 needs post text search; a `Scan` with a filter is unbounded and its cost grows with the whole table | An in-memory index (the interest-catalogue pattern, 001/D3) works because the catalogue is small and slow-changing. Posts are neither. OpenSearch is the documented replacement and is a **billable managed service** — barred without specific approval. |
| A **person-follow cap** (200) | FR-008's fan-out is one query per followed author; without a bound the Following feed has no stated worst case | Fan-out-on-write is forbidden by 001/FR-017 + SC-009 and by Principle II's precomputation clause. An unbounded read is not simpler, it is merely unmeasured. |
| A **second read watermark** (notifications, alongside conversations') | FR-005/FR-006 | Writing `readAt` on each row during a GET makes a read mutate N rows on a hot path. Conversations already use a watermark; this is one pattern applied twice, not two inventions. Note it deliberately does **not** copy the conversation row's `unreadCount` counter — see R2. |

## Constitution Check, re-evaluated after Phase 1 design

*Required by the governance section: every plan records its result, including a finding that
no principle is engaged.*

| Gate | Result after design | Where it is enforced |
|---|---|---|
| **G1, G2** (Principle I) | **Pass.** No new surface replaces an interest surface; FR-022 routes a search miss back to interests and people; drafts restore the interest and publishing still fails without one. | `contracts/openapi-delta.md`; existing interest suites |
| **G3** (every new read path in the matrix) | **Pass by design, unproven until built.** Five new/changed surfaces enumerated. | `contracts/visibility-matrix-delta.md` §3 |
| **G4** (mute/dismissal never in the boundary) | **Pass, and this is the design's load-bearing choice.** | `contracts/selection-vs-boundary.md`, two structural + one behavioural guard |
| **G5** (privacy is one clause, not per surface) | **Pass.** One candidate field, one clause; the matrix delta shows every other row unchanged, which is the evidence it was not a second predicate. | `contracts/visibility-matrix-delta.md` §2 |
| **G6** (term index selects, never decides) | **Pass.** Structurally identical to `postInterestIndex`. | research R6; matrix surface 14 |
| **G7** (hostile-path testing) | **Pass by design.** Named for FR-029, FR-044, FR-048, SC-007, SC-015. | `quickstart.md` |
| **G8** (dismissal in the signals disclosure) | **Pass, and it is an obligation not a nicety.** A collected signal absent from 007's disclosure and reset is a Principle III violation. | `data-model.md` § Dismissal |
| **G9** (mute invisible to its subject) | **Pass, structurally.** No inverted index, so no query the subject can write reaches it. | `data-model.md` § Mute |
| **G10, G11, G12** (Principle IV) | **Pass.** Phase D is marked must-not-split; mention text and collection names are reportable; appeal outcomes append to `MODLOG#`. | plan § Delivery order; `data-model.md` § Appeal |
| **V** (Emulation Is Not Evidence) | **No new divergence**, and one deliberate non-adoption: post search does not add a managed search service. Latency figures here are DynamoDB Local figures and are reported as such. | research R6; `contracts/following-feed.md` |
| **Cost** | **Pass.** Nothing provisioned. `synth` only. | plan § Technical Context |

### Two things the design changed about the plan's own claims

1. **US4's cost fell and US5's rose**, both on evidence rather than estimate (research R4,
   R5). The spec placed both at P1 in the same phase; that placement survives, but the
   effort inside Phase B is not distributed the way the spec implies, and pretending
   otherwise would misdirect the task breakdown.
2. **A person-follow cap is now a stated product constraint**, not an implementation detail
   (research R3). It arrived from a technical bound and the constitution requires that kind
   of decision be written down where it can be argued with rather than absorbed.

### What remains genuinely undecided

- **Reply nesting depth** is bounded at one level and the spec asked for that to be
  challenged at planning. Research R7 answers it: the bound is a *display* rule, the stored
  graph stays truthful under FR-025's attach-to-ancestor rule, so deepening later is a
  rendering change rather than a migration. Recorded as answered, not as open.
- **Stop-word handling and the 40-term cap** in post search are starting values, named as
  constants so the first real usage data can change them. They are not measured optima and
  must not be reported as such.
- **The hosting and datastore decisions** are the owner's and remain pending. Nothing in
  this feature depends on either, which is why the plan can proceed; push notifications were
  excluded from the spec for exactly that reason.

### Gate result after design: **PASS**

No violation requires justification. The three obligations recorded before Phase 0 stand
unchanged, and the honest limits of the FR-054 guards (research R16) are stated rather than
papered over.
