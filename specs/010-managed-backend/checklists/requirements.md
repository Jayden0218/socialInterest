# Specification Quality Checklist: A Backend That Stays Up

**Purpose**: Validate specification completeness and quality before planning
**Created**: 2026-09-13
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

**Deliberately names no product.** A scan for `postgres|supabase|koyeb|dynamo|docker|sql|ffmpeg`
returns nothing (the one hit is `US3` containing the letters "s3"). The choice of datastore,
storage and host belongs in the plan, where the alternatives can be weighed and recorded. A
spec that names Supabase in FR-002 could not later be satisfied by anything else without
rewriting the requirement, and the requirement — *reachable with no payment method on file* —
is the thing that is actually binding.

**Three edge cases exist to stop something changing by accident**, which is the harder kind
to catch:

- The twenty-person group cap loses its technical reason with this feature. 005 records it as
  a *correctness* constraint forced by a 100-item limit, not a product preference. When that
  limit goes, the cap becomes a decision nobody has made — so the spec forbids changing it
  here and says why.
- "Nothing needs migrating" is written as a thing **to confirm**, not an assumption to rely
  on. If it is wrong, it is catastrophically wrong, and the cost of checking is minutes.
- Orphaned media has never mattered because storage was disposable. With a 1 GB ceiling it
  starts to.

**FR-006 is the whole safety story.** This feature moves where data lives and changes nothing
about who may see it. The plan's gate is mechanical: the visibility totals and the
public-route snapshot must come out identical, or the design is wrong.

**SC-001 and SC-005 take seven days to measure.** That is honest rather than convenient —
"it persists" is not observable in an afternoon, and a criterion that cannot be rushed is the
point of writing it down.

---

## T007 — the contract, watched GREEN on the engine being replaced

**2026-09-13. 28 of 28, first run, against DynamoDB Local.**

```
datastore primitives — dynamodb
  getItem     3 ✓   putItem   3 ✓   deleteItem 2 ✓   updateItem 4 ✓
  increment   3 ✓   query     9 ✓   transact   4 ✓
Tests: 28 passed, 28 total    Time: 3.219 s
```

Whole integration suite after it landed: **232 passed of 233**, 49 suites of 50. The single
failure is `us1-exif.spec.ts`, which needs MinIO and cannot run in this development sandbox —
the baseline recorded in `plan.md`, unchanged, and **not** rounded up to a pass.

### Passing first time is not evidence, so each guarantee was broken

A guard that has only ever passed is not a guard. `base.repository.ts` was damaged six times,
one failure watched per guarantee, and restored (`git diff` clean) after each:

| The break | What went red |
|---|---|
| `increment` made a read-modify-write | twenty concurrent increments all count |
| `updateItem` made a put instead of a merge | merges, and leaves attributes it was not given untouched |
| `getItem` stopped calling `stripKeys` | strips the key attributes |
| `transact` applied its items one at a time | applies NOTHING when one item fails its condition |
| every item given a gsi1 key, and `query` widened to the base partition | returns only items that populate the index |
| `putItem` dropped its `ConditionExpression` | exactly one of five racing writers wins |

**The fourth of those is the Postgres implementation's most likely mistake** — a loop over the
items is the obvious naive translation of `transact`, and it is the one that breaks 001/FR-017.

### Two corrections to the contract, found by writing its test

T007 says a red means the test is wrong rather than the product. Twice it meant the **contract**
was wrong, which is the same thing one level up.

1. **`getItem` does not "return the item exactly as stored".** It strips `pk`, `sk` and the ten
   GSI key attributes, deliberately: a loaded item re-spread over a freshly built key would
   otherwise write back to its old location. Twenty-nine repositories rely on this, so it is now
   asserted in its own right.
2. **`increment` is not "a read-modify-write today and says so in its own comment".** It already
   uses `ADD`, and `interest.repository.ts:57` says so explicitly — "Atomic counter - no
   read-modify-write, so concurrent follows cannot race". The comment the contract and
   `data-model.md` are remembering belongs to `comment.repository.ts`, about a different
   operation. This is not pedantry: atomicity was listed as one of three deliberate behaviour
   **changes**, which would have licensed the new engine to differ here. It may not. The
   twenty-writer test holds Postgres to behaviour the product already has.

### What the test found out about the translation surface, and it is small

Counted rather than estimated, because "rewrite the persistence layer" and what this actually
is are very different jobs:

| Surface | Count | Detail |
|---|---|---|
| Conditions in the whole persistence layer | **2 distinct** | `attribute_not_exists(pk)` ×6, `attribute_exists(pk)` ×1 |
| Transaction item kinds | **3** | `Put`, `Delete`, `Update` |
| Update expressions | **a bounded set** | `SET a = :v`, `SET a = if_not_exists(a, :z) + :v`, `ADD a :n`, and combinations |

**The transaction item shape stays as it is.** Twenty-nine repositories construct
`{ Put | Delete | Update }` descriptors today; changing that shape means touching all of them,
which is exactly the remodelling R2 defers. The Postgres implementation accepts the same
descriptors and translates them.
