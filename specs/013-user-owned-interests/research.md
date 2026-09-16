# Research: The Interests Belong to the People Using Them

**Feature**: 013 | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

Prior work this builds on: [`docs/research/2026-09-16-user-owned-interests.md`](../../docs/research/2026-09-16-user-owned-interests.md),
which surveyed AO3, Stack Overflow, Reddit and the hashtag products, and found that this
repository already implements most of the AO3 synonym-to-canonical model.

---

## R1 — THE CONCURRENCY DEFECT IS ALREADY HERE, AND IT IS 011's HANDLE DEFECT EXACTLY

This is the most important finding in the feature, and it is a defect in the product **today**
rather than a risk this feature introduces.

`InterestRepository.createSubInterest` writes with `ConditionExpression:
'attribute_not_exists(pk)'`, where `pk` is `INTEREST#<interestId>` and `interestId` is a
**freshly minted ULID on every call**. The condition therefore **cannot fire for a NAME**. It
guards that the same interest is not written twice, which nothing was trying to do.

What actually prevents two interests called "Bouldering" is a **read-then-write** in
`interest.service.ts`: `findExact` looks in the catalogue, and if it finds nothing the write
proceeds.

**Word for word the 011 finding**: "`PersonRepository.create` guarded on
`attribute_not_exists(pk)` where `pk` is `USER#<userId>`, a fresh identifier per call, so the
condition could never fire for a handle." That was measured at **eight of eight** simultaneous
claims succeeding — "there was no race to lose, because there was no constraint".

**And here it is worse than a race.** `findExact` reads `CatalogueCache`, an **in-memory,
per-process** cache refreshed after a write. Two API processes do not see each other's new
interests until a refresh, so the window is not microseconds of scheduling — it is however long
the other process's cache is stale. On a single local process this is invisible, which is why it
has never bitten.

**Decision**: a name claim record, written in the **same transaction** as the interest, keyed on
the normalised name. `PersonRepository.create` already does exactly this for handles since 011,
and `HandleClaimRepository.claimItem` is the pattern to copy.

**Rationale**: 011 established that the claim must live where every caller comes through, not in
the service — "in `auth.service` it would have defended the one door a human uses and left four
open". `InterestRepository` is that place here.

**Measured before the fix, per SC-004**, because 011's lesson was that a read-then-write produces
an occasional 2 while an absent constraint produces a reliable N, and a fix aimed at narrowing a
window would be the wrong diagnosis for the second. The count decides which this is.

**Alternatives considered**: a unique index on `nameNormalised` — rejected, because the datastore
is addressed through the single-table key discipline and a second uniqueness mechanism is a
second thing to keep true. Relying on the existing read-then-write — rejected by the measurement.

---

## R2 — `findSimilar` MUST GO GLOBAL, AND IT WOULD HAVE FAILED SILENTLY

`CatalogueCache.findSimilar(name, parentId)` reads `this.byParent.get(parentId)`. With parents
gone, `parentId` is meaningless and the candidate list is **empty**, so `isTooSimilar` sees
nothing and every proposed name is accepted as new.

**Nothing fails.** No request errors, no test goes red; the duplicate gate simply stops having an
opinion. This is the same shape CLAUDE.md records as "a guard can lose its subject and pass" —
`hooks-before-return.test.ts` reading a barrel, finding no `export function`, and reporting zero
offenders in the same run that claimed 253 passing tests.

**Decision**: `findSimilar(name)` compares against every `active` interest.

**Rationale**: it is the control the whole feature rests on. The prior research found the same
conclusion across products — sprawl is won at the moment of creation, by showing what exists.

**Cost, and why it is acceptable now and not forever**: the comparison becomes O(n) Levenshtein
over the live catalogue per creation. With twelve interests that is free; with a hundred thousand
it is not. It stays acceptable because creation is rare relative to reads, the catalogue is
already fully in memory (`size()` walks it, and 007's candidate source enumerates it), and D3
already names the replacement: OpenSearch behind the same `CatalogueSearch` interface when the
catalogue outgrows an in-memory cache. **This feature makes that day arrive sooner and does not
bring it forward on its own evidence** — a measurement, not a guess, should trigger it.

**Alternatives considered**: a prefix or trigram pre-filter before Levenshtein — the right answer
eventually, deferred because it is an optimisation with no measurement behind it yet, and this
project has a rule about those.

---

## R3 — NORMALISATION STOPS AT WHAT CANNOT CHANGE MEANING

`normaliseName` is `s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()`. Case, punctuation and
repeated whitespace fold; nothing else does.

**Decision**: keep it exactly as it is. Do not add stemming, plural folding or transliteration.

**Rationale**: those are judgements that can be wrong, and wrong here means a person's post is
filed under a subject they did not choose. "Glasses" is not "glass"; "Saw" is not "See". The
measured table in the spec is the general case of the same point — a transformation that usually
works is a transformation that sometimes silently misfiles somebody's photograph.

Folding case and punctuation cannot change meaning, which is why it is safe to do automatically
and silently, and it is also **the overwhelming majority of real near-duplicates**.

**Note**: `normaliseName` strips non-ASCII entirely — `[^a-z0-9]` — so a name in a non-Latin
script normalises to the empty string. That is an existing behaviour this feature must decide
about rather than inherit; see R6.

---

## R4 — AUTOMATIC MERGING IS REFUSED ON A MEASUREMENT, NOT A PREFERENCE

The owner asked for merging when "the backend find out that these two word is similar". Run on
this repository's own `similarity` (normalised Levenshtein):

| Score | Pair | |
|---|---|---|
| 0.91 | photography / photograpy | real typo |
| 0.86 | Running / Runing | real typo |
| **0.83** | Baking / **Biking** | unrelated |
| **0.80** | Poker / **Power** | unrelated |
| **0.75** | Golf / **Wolf**, Java / **Lava** | unrelated |
| 0.23 | NYC / New York City | true synonym |
| 0.13 | Football / Soccer | true synonym |

The typo band (0.86–0.91) and the unrelated band (0.75–0.83) are adjacent and unordered with
respect to meaning; true synonyms are far below both. **Edit distance measures spelling.**

**Decision**: no automatic merge on a score (FR-011). Operator-performed merges only (FR-012).

**Rationale, beyond the table**: a merge here is **irreversible** — `handleInterestJob` moves
posts, moves followers, then sets `mergedInto`, and there is no inverse anywhere in the codebase.
An irreversible operation, performed automatically, at scale, on a signal that cannot separate
Baking from Biking, is the one change in this feature that could not be walked back.

**What the owner asked for is still delivered**, by R3: the near-duplicates people actually
create — case, spacing, punctuation — converge automatically and are never duplicated in the
first place, so there is nothing to merge.

**Alternatives considered**: auto-merge above 0.95 — the table shows it catches almost nothing
real while still risking a pair nobody has tested. Auto-merge with a reversible merge and an
undo window — genuinely defensible, and the honest path **if the owner overturns FR-011**;
recorded here so the order is clear: reversibility first, automation second, never the reverse.

---

## R5 — AN INTEREST IS BORN WITH A POST, WHICH MAKES ONE TRANSACTION OUT OF TWO CALLS

FR-004 requires that an interest cannot exist without a post. Today `createSubInterest` writes
`postCount: 0` and publishing is a separate request.

**Decision**: publishing accepts interest **names**; the API resolves each to an existing
interest or creates it, and the creation and the post land in **one transaction**.

**Rationale**: it is the only way FR-004 is true rather than usually true. Two requests means a
window in which an empty interest exists, and a publish that fails after the interest was created
leaves one permanently — which is the spec's own edge case. `Transactor`/`runTransaction` already
exists and 008/FR-051 used exactly this argument for collections: "a collection add writes the
membership row and the `savedPost` rows together, so a post cannot be in a collection and absent
from the saved list by any path".

**Consequence to face rather than discover**: `POST /v1/interests` as a standalone creation route
becomes unreachable for ordinary use. Whether it is removed is an FR-025 question — the route
snapshot must not move by accident.

**Alternatives considered**: create-then-publish with a cleanup job — rejected; it makes FR-004 a
property of the janitor rather than of the product, and the spec's edge case is exactly the window
it leaves open.

---

## R6 — DECISIONS THE CODE FORCES, WHICH THE SPEC LEFT OPEN

- **A name that normalises to empty** (punctuation only, or a non-Latin script, because
  `normaliseName` strips everything outside `[a-z0-9]`). **Decision**: publishing fails with a
  message naming the reason. The alternative — a nameless interest — is unrepresentable and must
  stay so. **This means the product is Latin-script-only for interest names today**, which is a
  real limitation and is recorded as one rather than left to be discovered.
- **`level` and `parentId` on `InterestItem`.** **Decision**: delete both rather than fix `level`
  to `'top'`. 006 established the rule — "a name that does not exist is a typecheck failure the
  moment somebody writes it again", which is why the `theme.color.*` shim was deleted rather than
  left exported. A vestigial `parentId` is an invitation to re-grow the hierarchy.
- **`keys.interestHierarchy(parentId, nameNormalised)`.** **Decision**: it becomes the name claim
  of R1, keyed on the normalised name alone. The index already exists and already carries the
  right field; what changes is that it stops being scoped by parent and starts being enforced.
- **`uniqueSlug` is a read-then-write too** (`findBySlug` in a loop, then write). **Decision**:
  in scope, because R1's transaction is the natural place to claim the slug as well, and leaving
  one half racy while fixing the other is the "declared half with no other half" this repository
  has recorded seven times.
- **The cold start** (FR-019). **Decision**: rebuild around what people have actually created —
  the most-used live interests — rather than remove the step. Removing it leaves a new account at
  an empty feed, which is 012/US3's problem, unsolved, arriving by another route.

---

## R7 — RESOLVING THE SPEC'S OPEN QUESTION: NO MERGE QUEUE IN THIS FEATURE

The spec carried one `[NEEDS CLARIFICATION]`: whether the operator merge **queue** is built here.

**Decision**: **no.** FR-012's capability is required and already exists; the surface that finds
candidate synonyms and presents them for decision is **not** built in this feature.

**Rationale**: three reasons, in order of weight.

1. **It cannot be built well yet.** A queue is only useful if it can propose candidates, and R4
   established that the one signal available — edit distance — scores true synonyms at 0.13–0.23,
   below every unrelated pair. A queue ranked by that signal would show Golf/Wolf and never
   NYC/New York City. Building the surface before there is a signal worth surfacing is the
   "declared half with no other half" pattern in a new place.
2. **Nobody has seen the volume.** The product has zero posts on the owner's install and twelve
   interests. Sizing a moderation surface against an imagined workload is what 002's deferred
   criteria exist to refuse.
3. **US2 is the control that matters**, and it is prevention rather than repair.

**What must be true for this to be safe**: an operator must still be able to merge when they
notice, which FR-012 and the existing job already provide. This is a decision to defer a
convenience, not a capability.

**Revisit when**: a real installation has enough interests that somebody asks for it, or a signal
better than edit distance exists (embeddings would find Football/Soccer where Levenshtein cannot).
