# Implementation Plan: The Interests Belong to the People Using Them

**Branch**: `claude/pensive-goldberg-jjjni5` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/013-user-owned-interests/spec.md`

## Summary

Hand the taxonomy over. The twelve interests we wrote are deleted; an interest becomes a word a
person types while publishing, flat and hashtag-like, and there will be many.

**Most of this feature is subtraction.** Creation, exact-duplicate refusal, the
"similar to these — still want a new one?" round trip, and a merge that moves posts and followers
behind a permanent redirect are all already built. What makes the catalogue ours is one required
field, `parentId`.

**Two things are not subtraction, and they are the real work:**

1. **A name uniqueness constraint that does not exist.** `createSubInterest` guards
   `attribute_not_exists(pk)` on a **fresh ULID**, so it cannot fire for a name; what prevents a
   duplicate today is a read against a **per-process in-memory cache**. This is 011's handle
   defect in a second place (research R1).
2. **A duplicate gate that would silently stop working.** `findSimilar` compares against siblings,
   and flat interests have none (research R2).

## Technical Context

**Language/Version**: TypeScript 5.7, NestJS 11 (API), React Native / Expo SDK 54 (mobile)

**Primary Dependencies**: none new. Every mechanism this needs — transactions, the merge job, the
similarity function, the name policy — is already in the repository

**Storage**: the single table on Postgres. One new row kind (a name claim); two fields deleted
from an existing one

**Testing**: jest for API unit and integration; the visibility matrix and route snapshots as
regression gates; `apps/e2e` over HTTP for the paths only a request can find; Maestro on a device
(**unavailable — see Risks**)

**Target Platform**: Android phone against a locally hosted API

**Performance Goals**: interest creation is rare relative to reads, so an O(n) similarity sweep
over the live catalogue is acceptable at this size and is **not** acceptable forever — see the
Risks table

**Constraints**: the visibility matrix must come out with the same surfaces and the same assertion
count; the route snapshots must not move except deliberately; no device verification available

**Scale/Scope**: 12 interests to remove, ~8 API files, ~6 mobile files, 3 artboards affected

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1.*

| Principle | Assessment |
|---|---|
| **I. Interest Is the Unit of Meaning** (NON-NEGOTIABLE) | **Engaged, and it PASSES as written — checked by reading the binding text, not assumed.** Principle I requires every post to be filed under at least one interest, requires interest spaces, interest search and the interest on a post to stay reachable, and requires the ranking to be inspectable and resettable. It is **silent on who creates interests**: "curated", "catalogue" and "operator" do not appear in it. FR-005 keeps every post filed; FR-002 changes only whose vocabulary it is. **No amendment is needed.** What this feature must not do is let the interest decay into "a tag nobody navigates" — the failure the rationale names — which is what US2's prevention and FR-022's housekeeping are for |
| **II. Visibility Is Decided Once** (NON-NEGOTIABLE) | **Not engaged, and that is the requirement.** No new read path and no new surface. FR-024/FR-025 make it mechanical, and FR-026 keeps an empty interest space from revealing that the boundary emptied it. **One thing to watch**: a merge MOVES posts between interests, so index rows move — the boundary still decides, but the candidate set changes, and `postInterestIndex` carries a denormalised `visibility` that a move must not drift |
| **III. Privacy Enforced Server-Side** | **Untouched.** No new field about a person, no new read path |
| **IV. Safety Ships With the Product** | **Engaged lightly.** A report is scoped to an interest; merging moves posts between interests, so a moderation decision must not be orphaned by a merge. The existing job moves posts rather than copying them, so the scope follows |
| **V. Emulation Is Not Evidence** | **Engaged.** No device is available. Every claim is made at the tier that supports it and the device tier is **not run** |

**Gate: PASS.** No violation to justify, so Complexity Tracking is omitted rather than filled with
"none".

**Re-checked after Phase 1**: still PASS. The design adds one row kind and removes two fields. It
introduces no surface, no route that widens anything, and no read path.

## Project Structure

### Documentation (this feature)

```text
specs/013-user-owned-interests/
├── spec.md
├── plan.md            # this file
├── research.md        # R1-R7, including the resolved open question
├── data-model.md
├── quickstart.md
├── contracts/
│   └── interest-naming.md
└── checklists/requirements.md
```

### Source Code

```text
apps/api/src/
├── persistence/
│   ├── keys.ts                      # interestHierarchy becomes the NAME CLAIM
│   ├── interest.repository.ts       # create in a TRANSACTION with the claim; level/parentId gone
│   └── interest-name-claim.repository.ts   # NEW - the 011 HandleClaim pattern
├── modules/interests/
│   ├── interest.service.ts          # flat; global similarity; no parent
│   ├── catalogue.cache.ts           # findSimilar/findExact lose parentId
│   └── interest.controller.ts       # parentId gone from the schema
└── modules/posts/
    └── post.service.ts              # publish resolves-or-creates, in ONE transaction

apps/mobile/src/
├── features/publish/ComposeScreen   # name an interest; no catalogue picker
├── features/discover/               # Explore stops browsing a hierarchy
└── screens/PickInterestsContainer   # cold start rebuilt on what people created

infra/scripts/seed-catalogue.ts      # DELETED
```

**Structure Decision**: one new repository file, one deleted script, edits in place elsewhere. No
new module and no new route — and the last part is a constraint, not an observation: FR-025 says
the route snapshots must not move by accident.

## The decisions worth not re-litigating

### The name claim goes in the repository, not the service

`InterestRepository.create` is the one path every interest comes through. 011 settled this exact
argument for handles: putting the constraint in `auth.service` "would have defended the one door a
human uses and left four open". The claim row is written in the same transaction as the interest.

### Publishing resolves-or-creates in one transaction

FR-004 says an interest cannot exist without a post. Two requests leave a window where one does,
and a publish that fails afterwards leaves it forever. One transaction makes the requirement true
rather than usually true — the same argument 008/FR-051 used for collections.

### Normalisation stops where meaning starts

Case, punctuation and whitespace fold. Stemming, plurals and transliteration do not. Those are
judgements, and a wrong one files somebody's photograph under a subject they did not choose. This
is also the half that delivers what the owner asked for: those near-duplicates are never created,
so there is nothing to merge.

### `level` and `parentId` are deleted, not defaulted

006's rule: "a name that does not exist is a typecheck failure the moment somebody writes it
again". A `parentId` left on the item as `undefined` is an invitation to re-grow the hierarchy.

## Phasing

| Phase | What | Shippable alone? |
|---|---|---|
| **1** | **Measure the concurrency defect first** — N simultaneous creations of one name, counted | Yes, and it decides whether R1 is a race or an absent constraint |
| **2** | The name claim: transaction, repository, back-fill for existing rows | Yes |
| **3** | Flatten: `parentId` out of the schema, `level`/`parentId` off the item, global `findSimilar` | Yes |
| **4** | Publish resolves-or-creates in one transaction | Yes |
| **5** | Delete the catalogue and migrate existing installs | Yes |
| **6** | Mobile: compose names an interest; Explore and the cold start rebuilt | Yes |
| **7** | Housekeeping: an interest with no posts stops being browsable | Yes |
| **8** | Close-out: matrix, snapshots, the withdrawn roll-up grepped out of the COPY, the run recorded | — |

**Phase 1 before everything.** 011 established that a read-then-write produces an occasional 2
while an absent constraint produces a reliable N, and that a fix aimed at narrowing a window is the
wrong diagnosis for the second. The count decides which this is, and it costs one test.

**Phase 5 after Phase 4.** Deleting the catalogue before publishing can create interests leaves
the product with no way to file a post at all.

## The places the obvious implementation is wrong

1. **The duplicate gate fails OPEN, not closed.** `findSimilar` with no parent returns an empty
   candidate list, `isTooSimilar([])` is false, and every name is accepted as new. Nothing errors.
   A guard that has lost its subject is this repository's most-repeated defect.
2. **`uniqueSlug` is a read-then-write too**, in a loop. Fixing the name race and leaving the slug
   race is the declared-half-with-no-other-half pattern, so the slug is claimed in the same
   transaction.
3. **A name that normalises to empty must fail loudly.** `normaliseName` strips everything outside
   `[a-z0-9]`, so a non-Latin name normalises to `''`. That is a real limitation of the product
   today, and it must be a stated refusal rather than a nameless interest.
4. **Migration must not fold children into parents.** Flattening means every existing interest
   survives under its own name; folding would move somebody's post to a subject they did not
   choose, which is the imposition this whole feature exists to end.

## Risks

| Risk | Response |
|---|---|
| **The similarity sweep is O(n) over the live catalogue, and this feature makes n grow without bound** | Acceptable at this size: creation is rare, and the catalogue is already fully in memory for 007's candidate source. D3 already names the successor — OpenSearch behind the same `CatalogueSearch` interface. **Triggered by a measurement, not by a feeling**, and this plan does not pre-emptively optimise |
| **A merge moves index rows carrying a denormalised `visibility`** | 008 recorded that a drifted index item "is exactly the SC-009 failure this class exists to make impossible". The merge job's move must carry the field, and the matrix is the gate |
| **The route snapshot moves because a creation route becomes unreachable** | FR-025. Whether `POST /v1/interests` survives is a deliberate, reviewed decision in Phase 4, never an incidental diff |
| **No device verification** | Reported **not run**, with the browser and HTTP tiers doing what they can. Nothing since 011 has run on a device |
| **The catalogue is deleted on an install that has posts** | FR-020. Migration keeps every interest that holds a post; only genuinely unused seeded rows go |
