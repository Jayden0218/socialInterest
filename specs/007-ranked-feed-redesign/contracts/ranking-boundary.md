# Contract: the ranking boundary

**This is the contract that makes Constitution 2.0.0 Principle II survive a ranked feed.**
It is the reason the amendment strengthened that principle instead of leaving it alone.

## The rule

> Ranking selects **candidates**. The visibility boundary **decides**.

Stated as three obligations:

1. **Ranking MUST NOT determine whether a viewer may see a post.** It may choose which
   posts are considered and in what order. It may not admit, exclude, or reorder on the
   basis of who is permitted to see what.
2. **Every ranked result set MUST pass through `VisibilityFilter`, at read time, in the
   same request that serves it.**
3. **No result set assembled before the viewer was known may be served.** Candidate
   references may be precomputed; a decision about a viewer may not.

## How it is enforced

Structurally, so that it cannot be satisfied by intention.

| Check | What it asserts | Fails when |
|---|---|---|
| **C1** — `ranking/` cannot import the visibility boundary | The ranking module has no reference to `VisibilityFilter`, `Viewer`, or any block/visibility repository | A ranker starts filtering |
| **C2** — the feed calls the filter after the ranker | In `FeedService`, `VisibilityFilter.decide` is called on the ranker's output, not before it and not instead of it | Someone ranks a pre-filtered set and drops the filter as redundant |
| **C3** — set equality | For a viewer with no blocks and only public candidates, the id set the ranker proposes and the id set served are identical | The ranker is silently dropping posts, i.e. filtering |
| **C4** — subset always | The served set is always a subset of the proposed set | The ranker or anything after it ADMITS a post the filter did not pass |
| **C5** — no cached decision | Two requests by different viewers over the same candidates return correctly different sets | A per-candidate decision is memoised across viewers |

C1 is a dependency check and runs in milliseconds. C3 and C4 are behavioural and run in
the integration suite. **C4 is the one that matters most**: a ranker that drops a post is
a bug; a pipeline that admits one is a privacy failure.

## Immediacy

FR-006 and 001/FR-017 both require a visibility change to land everywhere at once. A
ranked feed is the classic place that guarantee is lost, because caching a ranked page is
so obviously attractive.

- A ranked page MAY be recomputed on every request.
- Candidate *references* MAY be cached, because a reference carries no decision.
- A *served* page MUST NOT be cached across requests.

**Test**: flip a post to private and request the feed. It is absent on the first request
after the flip. Not "eventually", not "after the cache expires" — the first request.

## Why this is a contract and not a code comment

The composed feed enforced this by accident: it read only interests the viewer followed,
so its candidate set was already viewer-scoped. Ranking removes that accident. The
protection has to become explicit at exactly the moment it stops being structural, which
is now.
