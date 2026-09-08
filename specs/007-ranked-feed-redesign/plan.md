# Implementation Plan: Ranked Feed and App Redesign

**Branch**: `claude/spec-kit-integration-juhrza` | **Date**: 2026-09-08 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-ranked-feed-redesign/spec.md`

**Constitution**: **2.0.0**, amended 2026-09-08. This feature is the reason it was
amended, so the Constitution Check below is the load-bearing section of this plan.

## Summary

Replace the interest-composed home feed with **one blended stream ranked from the
viewer's own behaviour**, and rebuild all twenty screens in the approved design.

The technical shape follows from one sentence in the constitution: *ranking selects
candidates; the visibility boundary decides.* So the pipeline gains a stage in front of
`VisibilityFilter` and changes nothing behind it. Signals are recorded on the client,
batched to the server, folded into a per-viewer profile, and used to select and order
candidates. `VisibilityFilter` still runs per request, at read time, on the ranked
candidate set — which is what keeps FR-017's immediate visibility flip true and D1
intact.

## Technical Context

**Language/Version**: TypeScript 5.9, Node 22

**Primary Dependencies**: NestJS 11 (API), React Native / Expo SDK 54 (mobile),
`@aws-sdk/client-dynamodb` against DynamoDB Local, MinIO, ffmpeg. No new runtime
dependency is introduced by this feature.

**Storage**: DynamoDB single-table (`sih-main`) on the local profile. Signals and the
signal profile are new item types on the existing table; no new store, no new GSI unless
research R3 concludes otherwise.

**Testing**: jest — `@sih/api` (unit/integration/contract/visibility projects),
`@sih/mobile` (component and guard tests), `@sih/e2e` (journeys over real HTTP, browser
journeys under react-native-web), Maestro flows on the Android emulator in CI.

**Target Platform**: Android (verified on an emulator in CI), react-native-web as a
verification surface. iOS remains unverified and out of scope.

**Project Type**: Mobile app + API in a pnpm monorepo.

**Performance Goals**: Feed first screen ready in under 2s at p95 on the reference device
(SC-012). Ranking must not add more than ~150ms to a feed request at the local profile's
candidate volumes.

**Constraints**: No billable cloud resources. Everything runs on the local profile. The
ranking service is a component of the existing API, not a managed service — naming one
would be a Cost-and-Environment violation, not a design choice.

**Scale/Scope**: 20 screens, ~28 functional requirements, 6 recorded withdrawals. The API
change is concentrated in one module (`feed/`) plus two new ones (`signals/`, `ranking/`);
the mobile change touches every screen.

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1.*

| Principle | Engaged? | Gate for this feature |
|---|---|---|
| **I. Interest Is the Unit of Meaning** (NON-NEGOTIABLE) | **Yes — this feature is why it was amended** | Three clauses, three gates. **G1**: publishing without an interest fails (FR-016). **G2**: interest surfaces stay complete and reachable — interest space, roll-up, typed search (FR-017–FR-019). **G3**: the ranking is inspectable and resettable (FR-011, FR-012). Any one missing and the amendment has been used to delete a guarantee rather than to replace one. |
| **II. Visibility Is Decided Once** (NON-NEGOTIABLE) | **Yes, and at its most dangerous point** | **G4**: ranking produces candidates and never filters for visibility. Every ranked set passes `VisibilityFilter` at read time, per request. No precomputed-per-viewer set may be served. Enforced structurally, not by review — see Phase 1 contracts. |
| **III. Privacy Enforced Server-Side** | **Yes — new behavioural collection** | **G5**: a person's signals are not readable or inferable by anyone else on any enumerated surface, and the disclosure and reset exist. Tested through the path a hostile client would take, not the well-behaved one. |
| **IV. Safety Ships With the Product** | Yes | **G6**: report and block remain reachable on the shortest supported screen at the largest platform font. This is a re-run of a defect that reached production once. |
| **V. Emulation Is Not Evidence** | No new divergence | The ranking service is application code, not a stand-in for a managed service. No new entry in the divergence register. If ranking is ever moved to a hosted service, this principle applies again. |
| **Cost and Environment** | Yes | **G7**: every task completable on the local profile, CI green without credentials, nothing provisioned. |

### Gate result: PASS, with two obligations recorded rather than waived

1. **The FR-033 negative test is deleted, not weakened** (RS-002). Deleting a guard is
   normally a violation. It is permitted here only because the constitution's Sync Impact
   Report names this specific test as invalidated by an amendment already made. A guard
   whose principle still stands must not be removed on the strength of that note.
2. **`001/plan.md`'s Constitution Check was written against 1.0.0** and is stale (RS-005).
   The governance section requires a plan written before an amendment to be re-evaluated
   before further implementation. That is a task in this feature, not a footnote.
3. **001/FR-034 is withdrawn as written and carried forward as 007/FR-029** (RS-007). It
   said posts by followed people outrank unfollowed authors *within the same interest* — a
   grouping the ranked feed does not have. Its implementation is deleted with the composed
   feed, so leaving it unstated would have removed a live requirement by side effect. A
   follow is an explicit declaration rather than observed behaviour, which is why it is a
   requirement and not a fifth entry in the behavioural signal set.

## Project Structure

### Documentation (this feature)

```text
specs/007-ranked-feed-redesign/
├── plan.md              # This file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   ├── ranking-boundary.md
│   └── signals.md
├── checklists/
│   └── requirements.md
└── tasks.md             # /speckit-tasks, not created here
```

### Source code

```text
apps/api/src/
├── modules/
│   ├── signals/                 # NEW — ingest, batch, fold into a profile, clear
│   │   ├── signal.controller.ts
│   │   ├── signal.service.ts
│   │   └── seed.service.ts      # cold-start picks, NOT interest follows
│   ├── ranking/                 # NEW — candidate selection and ordering
│   │   ├── ranking.service.ts
│   │   ├── candidate-source.ts  # where candidates come from
│   │   ├── decay.ts             # applied on read, never by rewriting rows
│   │   ├── constants.ts         # the values research chose, named
│   │   └── explore.ts           # FR-007, the anti-collapse share
│   ├── feed/                    # CHANGED — composition replaced by ranking
│   │   ├── feed.service.ts
│   │   ├── ranking.ts           # DELETED; superseded by modules/ranking/
│   │   └── follow-expansion.ts  # DELETED; the composed feed's follow-graph expansion
│   └── posts/                   # UNCHANGED — one responder, one shape
├── persistence/
│   └── signal.repository.ts     # NEW
└── visibility/                  # UNCHANGED, deliberately

apps/api/tests/
├── integration/us4-fr033-boundary.spec.ts   # DELETED (RS-002)
├── unit/feed-ranking.spec.ts                # DELETED — imports the module T011 removes
├── unit/feed-does-not-read-place-follows.spec.ts  # KEPT, re-pointed. 004/SC-006 stands
├── integration/ranked-feed.spec.ts          # NEW
├── unit/ranking-cannot-admit.spec.ts        # NEW — the G4 structural guard
└── visibility/matrix.spec.ts                # EXTENDED — the feed row is now ranked

apps/mobile/src/
├── ui/                          # tokens rebuilt for the approved design
├── components/                  # PostCard -> waterfall card; Waterfall (new)
├── features/                    # all twenty screens
└── __tests__/                   # guards, extended

apps/e2e/
├── journeys/feed.spec.ts        # REWRITTEN against the ranked feed (RS-003)
├── journeys/signals.spec.ts     # NEW
└── scripts/seed-fr033-fixture.ts # DELETED (RS-003)

design/007-ui/                   # the twenty approved artboards, unchanged
```

**Structure Decision**: the API change is deliberately **additive in front of the
existing pipeline**. `signals/` and `ranking/` are new modules; `feed/` loses its
composition logic and gains a call to `ranking`; `visibility/` and `posts/` are not
touched. That shape is what makes G4 checkable — if `VisibilityFilter` is untouched and
`ranking/` cannot import it, ranking cannot have acquired a second predicate.

Mobile is the opposite: every screen changes, nothing structural does. Screens keep their
files, their containers and their test identifiers (FR-027); what changes is the token
layer and the component vocabulary underneath them.

## Phases

| Phase | Contents | Gate to the next |
|---|---|---|
| **0. Research** | R1 candidate source · R2 signal model and decay · R3 storage shape · R4 cold start · R5 exploration · R6 waterfall on RN · R7 dwell measurement | Every open question resolved; no decision left to implementation |
| **1. Design** | data-model, the two contracts, quickstart | The ranking boundary is expressed as a contract with a test, not as a convention |
| **2. Withdrawals** | RS-001…RS-006 | The old guarantee is gone from code, tests, specs and the project guide — not merely unreferenced |
| **3. Signals** | ingest, profile, disclosure, reset (US2) | G3 and G5 provable; reset returns the feed to seed state |
| **4. Ranked feed** | candidate source, ranking, exploration, paging (US1) | G4 provable; SC-005 and SC-006 measured |
| **5. Cold start** | first-run selection as a seed (FR-014, FR-015) | A new account reaches a populated feed |
| **6. Redesign** | tokens, waterfall, twenty screens (US3–US5) | G1, G2, G6; testID snapshot unchanged |
| **7. Evidence** | benchmark (SC-012), full CI list, emulator run, run record | The numeric criteria are MEASURED, not asserted — then an emulator run, or the feature is not complete |

**Withdrawals come before the new feed, not after.** If the ranked feed lands first, the
FR-033 test fails and the pressure is to weaken it — which is exactly what RS-002 forbids.
Deleting it while the old feed still passes keeps that decision clean.

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Deleting a test rather than adapting it (RS-002) | The guarantee it enforced has been withdrawn by constitutional amendment | Adapting it would produce a test asserting a boundary the product no longer has. It would pass, and it would read as coverage of something real. A deleted test is honest; a hollow one is worse than none |
| Two new API modules where one would do | `signals/` records what happened; `ranking/` decides what to show. Keeping them apart is what lets the G4 guard say "ranking cannot reach the visibility boundary" as a structural fact | One module would make the import graph unable to distinguish recording from deciding, and the guard would have to read intent instead of dependencies |

## Constitution re-check, after Phase 1 design

*Required by the governance section. Re-evaluated against the artifacts now written, not
against the intentions above.*

| Gate | Where it is discharged | Verdict |
|---|---|---|
| **G1** — publishing without an interest fails | `Compose` requires it (FR-016); the interest is what the profile is keyed by, so a post without one cannot be ranked | **Held** |
| **G2** — interest surfaces stay complete | `Interest` space with roll-up, typed search, the interest on every post navigating to it (FR-017–FR-019); data-model B7 keeps the interest index as the candidate source, so the taxonomy is load-bearing in the ranking too | **Held** |
| **G3** — ranking inspectable and resettable | `contracts/signals.md` promises the disclosure is rendered from the same weights the ranker reads, so it cannot drift; reset deletes profile AND raw events, asserted against the store | **Held** |
| **G4** — ranking selects, the boundary decides | `contracts/ranking-boundary.md`, five checks. C1 is a dependency check; C4 asserts the served set is always a SUBSET of the proposed set | **Held, and strengthened** |
| **G5** — signals private, tested hostilely | `contracts/signals.md` § the hostile-client test — five cases the app's own client cannot exercise | **Held** |
| **G6** — safety reachable | SC-010 and `safety-fit`, at the largest font on a 640pt screen | **Held** |
| **G7** — no spend | Two new item types on the existing table, no new GSI, no new service | **Held** |

**One thing the design changed about the gates.** G4 was written expecting a review-time
check. Phase 1 made it a dependency check plus a set-relation assertion, which is
stronger: C1 fails the build the moment `ranking/` references the visibility boundary,
without anyone having to notice.

**One thing the design revealed.** The composed feed satisfied Principle II *by accident*
— it read only interests the viewer followed, so its candidate set was already
viewer-scoped and could not over-admit. Ranking removes that accident. This is why the
amendment strengthened Principle II rather than leaving it: the protection had to become
explicit at exactly the moment it stopped being structural.

## What this plan does NOT do

- **It does not specify ranking quality.** SC-001 asserts direction, not goodness.
  Choosing a quality target without real usage would set a number the tests hit and the
  product misses.
- **It does not touch D1.** Read-time assembly stays. Ranking may precompute candidate
  references; it may never precompute what a viewer is allowed to see.
- **It does not add a managed service.** A hosted ranking service would be both a spend
  decision and a new Principle V divergence.
- **It does not reopen the design.** `design/007-ui/` is approved and settled.

---

## Post-implementation re-check (2026-09-08) — T078

The artifacts have drifted from what was built before, and it was the owner who
noticed rather than me. So this records where the plan and the build differ,
rather than leaving the plan reading as though it predicted everything.

**What the plan did not anticipate, and the spec now carries:**

- **FR-030 and RS-008.** Withdrawing 001/FR-032 left the interest-follow control
  in the app doing NOTHING, and neither the withdrawal list nor
  `/speckit-analyze` caught it — four 001 suites going red during implementation
  did. An interest follow is now a standing declaration that feeds the ranking
  at one unit, the same as a like. It adds weight, never a boundary.
- **Seven type roles, not five.** 006/FR-018 settled on five; the approved
  artboards use seven, and `small` (a like count) and `tab` are real
  distinctions rather than shades of the same.
- **`coldStartComplete` on the disclosure.** FR-014 says a person is asked once,
  and `seedInterests.length` cannot tell "answered none" from "never asked".

**Where the built values differ from `design/007-ui/_tokens.md`, deliberately:**

- `text.muted` is `#606C66`, not the artboard's `#8A948C`, which is 2.9:1 on
  white. The design is settled on FORM; 006/FR-015's contrast floor is not a
  matter of taste.
- The interest lightness is OKLCH 0.52, chosen by enumerating all 360 hues
  against both surfaces rather than by matching the five hues the artboards name.

**Gates, re-checked against the build rather than against the design:**

| Gate | Verdict after implementation |
|---|---|
| **G1** | Held. Enforced by the schema AND the service, and the message names the missing field. `interest-required.spec.ts` drives raw HTTP and covers the EDIT door too, which a guard on `create` alone leaves open. |
| **G2** | Held, and it was NOT held when the phase began: the interest space was unreachable from post detail — bare `Text` in the accent colour with no press handler. `interest-reachable.spec.ts` walks both routes and is verified red against that. |
| **G3** | Held, and made structural: the disclosure calls `RankingService.weightsFor`, so "the same weights the ranker reads" is not a convention. It would have drifted within one commit otherwise — FR-030 added declarations to the ranking. |
| **G4** | Held. C1 verified red on a real import; C2-C5 verified red against a cached page and a memoised decision. |
| **G5** | Held. Verified red against a service that trusts the client. |
| **G6** | Held, and extended: SC-010 now measures every primary control at 130% text on a 640pt viewport, not only the safety sheet. |
| **G7** | Held. No new GSI, no new service, no spend. |

**What the plan claimed that measurement changed:** nothing about the
architecture. The one number it could not have predicted is that the ranker is
about 20% of the request (34.9ms of 166.5ms p95), which says the time goes to
the visibility boundary and the hydration — the part 001 already measured.
