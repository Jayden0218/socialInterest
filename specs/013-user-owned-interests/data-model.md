# Data Model: The Interests Belong to the People Using Them

**Feature**: 013 | **Date**: 2026-09-16 | **Plan**: [plan.md](./plan.md)

Only what this feature changes. The single-table key discipline of
[`specs/001-interest-media-sharing/data-model.md`](../001-interest-media-sharing/data-model.md)
is unchanged.

## Interest — two fields removed, one meaning changed

```
pk    INTEREST#<interestId>
sk    #META
gsi1  ISLUG#<slug> / #META
```

| Field | Change |
|---|---|
| `interestId`, `name`, `nameNormalised`, `slug`, `createdBy`, `description`, `descriptionUpdatedAt`, `postCount`, `followerCount`, `state`, `mergedIntoId`, `createdAt` | unchanged |
| `level: 'top' \| 'sub'` | **DELETED** |
| `parentId?: string` | **DELETED** |

**Deleted rather than defaulted.** A `level` pinned to `'top'` and a `parentId` left `undefined`
are an invitation to re-grow the hierarchy; a field that does not exist is a typecheck failure the
moment somebody writes it, which 006 established is the stronger guard.

`postCount` acquires a second job: FR-004 makes it **≥ 1 for the whole life of an interest**, and
FR-022 makes zero the condition for retirement.

### State, unchanged and now load-bearing

`active → merging → merged` already exists and the merge job already drives it. `retired` is what
FR-022 uses for an interest whose last post went away — **retired, not deleted**, so that a link
to it from somewhere the boundary has not re-evaluated does not 404 into nothing.

## Interest name claim — NEW

The constraint that does not exist today.

```
pk    INAME#<nameNormalised>
sk    #CLAIM
      interestId, claimedAt
```

Written in the **same transaction** as the interest, with `attribute_not_exists(pk)`. This is
`HandleClaimRepository`'s shape from 011, deliberately — that feature established both the
pattern and why it belongs in the repository rather than in a service.

**Why a row and not a condition on the interest item**: the interest's own `pk` carries a fresh
ULID, so a condition on it can never speak about the name. Research R1.

**Back-fill is required and must be measured first.** 011: "a claim record defends only rows that
carry one, and the 6,375 existing handles carried none — so the first human ever to choose a
handle could have taken one already in use." Existing interests carry no claim. The back-fill
counts collisions, refuses to write if the count is not zero, and leaves which interest keeps a
contested name to a person.

## Slug claim — NEW

```
pk    ISLUG#<slug>
sk    #CLAIM
      interestId
```

`uniqueSlug` is a read-then-write in a loop and races exactly as the name does. Claimed in the
same transaction, because fixing one half and leaving the other is the declared-half pattern.

## Retired key

`keys.interestHierarchy(parentId, nameNormalised)` — the GSI that indexed an interest under its
parent by normalised name. With no parents it has no meaning as a hierarchy index. Its **name**
half becomes the claim above; the key itself is removed.

## Unchanged, and worth stating because a reader will ask

- **`postInterestIndex`** — `INTEREST#<id> / POST#<createdAt>#<postId>`, carrying the
  denormalised `visibility` the boundary reads. **A merge moves these rows**, and the move must
  carry `visibility` with them: 008 recorded that a drifted index item "is exactly the SC-009
  failure this class exists to make impossible".
- **Its per-post fan-out shrinks.** 001/FR-024 wrote one index row per interest in the post's
  *expanded* set — the sub-interest **and its parent**. With no parents, a post writes one row per
  interest it actually carries. Less work per publish, and the roll-up it existed for is withdrawn.
- **Interest follows** — unchanged. A follow is still a standing declaration worth one unit to the
  ranker (007/FR-030).
- **Interest colour** — derived from `interestId` by FNV-1a; a child previously borrowed its
  parent's hue. With no parents every interest gets its own, and the existing enumeration over all
  720 generated colours in both palettes already covers the space.

## Migration

| Existing state | After |
|---|---|
| Seeded interest with posts | Survives as an ordinary interest under its own name. FR-020 |
| Seeded interest with no posts | Removed. It is ours and unused |
| Person-created sub-interest | Survives under its **own** name; the parent edge is dropped |
| A post filed under a sub-interest | Unchanged — it keeps the interest it was filed under |
| A post's index row against a **parent** it only had by roll-up | Removed. The roll-up is withdrawn (FR-021) |

**Children are never folded into parents.** Folding would move somebody's post to a subject they
did not choose, which is the imposition this feature exists to end.

**Name collisions become possible at migration**: two sub-interests under different parents could
share a name, and flat they would collide. The migration **counts first and refuses to run if the
count is not zero** — the same discipline as the claim back-fill, and for the same reason: which
interest keeps a contested name is a person's decision, not a script's.
