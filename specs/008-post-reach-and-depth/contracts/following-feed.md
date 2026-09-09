# Contract: the Following feed

**Feature**: 008 / US3 | FR-008, FR-009, FR-010, SC-004, SC-005

**This is a contract.** Its guards are written before the service.

## What it is

`GET /v1/feed/following` returns posts by the authors the viewer follows, **newest first**.

- **No ranking.** Order is `createdAt` descending. No boost, no decay, no weighting — not
  even the followed-author boost, which would be meaningless on a surface where every author
  is followed.
- **No exploration.** The ranked feed's ε-sampling has no place here; this surface exists to
  be the predictable alternative to it.
- **No signals recorded.** Reading this surface moves nothing in the viewer's signal
  profile (FR-009).

If it ranked, it would be a second "For you" — which is the thing it exists to be an
alternative to.

## Selection and the boundary

Candidates come from the follow graph (A9 → A5 per author, merge-sorted). They then pass
`VisibilityFilter` at read time, per request, like every other surface.

Mute applies here (selection). Account privacy applies here via the boundary, though the
common case is moot: a follower of a private account sees their posts anyway.

## Bounds, stated

`MAX_FOLLOWED_PEOPLE = 200`. The fan-out is one query per followed author, so without a cap
this surface has no stated worst case. The number mirrors `MAX_FOLLOWED_INTERESTS` and the
same 2s p95 budget that value was chosen against.

The cursor is a `createdAt` timestamp. There is no stored cursor state and no materialised
page — 001/FR-017 and SC-009 require a visibility change to land immediately, and a stored
page is the thing that cannot guarantee it.

## Empty state

FR-010: a viewer following nobody is told **what the surface is for**, not merely that it is
empty. The hint value is part of the API response (`emptyStateHint`), not invented by the
client — 006 recorded a test that invented its own hint values and failed for its own reason
rather than the product's, and 007 recorded that `emptyStateHint` never reached a client at
all because `ApiPage<T>` declared `nextCursor` at the wrong level. Both mean: assert this
against a **real response**, not a stub.

## Guards

| Guard | Kind | Asserts |
|---|---|---|
| `tests/unit/following-feed-is-unranked.spec.ts` | Structural | `following-feed.service.ts` does not import `SignalService`, `RankingService` or `CandidateSource`, transitively. **Verified RED against a real import.** |
| `tests/integration/following-records-no-signals.spec.ts` | Behavioural | Read the signal profile, page through Following, read it again — unchanged (SC-005) |
| `tests/integration/following-only-followed.spec.ts` | Behavioural | Mixed fixture; zero posts by unfollowed authors (SC-004) |
| `tests/integration/following-is-chronological.spec.ts` | Behavioural | Strictly descending `createdAt`, including across a page boundary |
| `apps/e2e/journeys/following.spec.ts` | Over HTTP | Second page actually loads. 007 found five features' worth of pagination that had never loaded a page two, because every mobile test stubbed the data layer with the same wrong shape the type had. |

Both a structural and a behavioural signal guard, because they fail at different times: the
structural one when the dependency appears, the behavioural one when the effect does.

## What this contract does not claim

Nothing here is evidence about performance at scale. The 2s budget is measured against
DynamoDB Local, which CLAUDE.md records is the lowest ceiling in this stack by an order of
magnitude (882 req/s against an application shape capable of 9,475). A Following-feed
latency figure from the local profile says nothing about a provisioned datastore, and must
not be reported as if it did (Principle V).
