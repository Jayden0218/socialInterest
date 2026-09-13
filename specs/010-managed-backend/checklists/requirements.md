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

---

## Phase 3 (US1) — the engine is Postgres, and no gate moved

**2026-09-13.** `base.repository.ts` speaks SQL. `dynamo-client.ts` is deleted.

### T016 — the same contract, the new engine

**30 of 30 on Postgres**, the same assertions that were green on DynamoDB. The old engine is
not kept as a second entry in the suite: two datastore implementations selected by
configuration is exactly the shape the four AWS adapters were deleted for. The comparison
happened across time (T007, then this) and is written down.

### T018 — the T004 baselines, unchanged

| Gate | Baseline (DynamoDB) | Postgres |
|---|---|---|
| Post assertions / surfaces | 1,470 across 15 | **1,470 across 15** |
| Review assertions | 18 | **18** |
| Visibility suite | 1,522 / 1,522 | **1,522 / 1,522** |
| Route snapshots | unchanged | **unchanged** (in the integration suite, green) |
| Whole API suite | 3 failures, all MinIO | **2,018 of 2,021 — the same 3** |

The three are `ports.contract.spec.ts` ×2 and `us1-exif.spec.ts`, all `ECONNREFUSED
127.0.0.1:9000`. They fail identically on both engines and cannot run in this sandbox.

### T019 — durability, by hand, with the container DESTROYED rather than restarted

`apps/api/scripts/durability-probe.ts` writes through `PersonRepository` and `PostTransaction`
— so through `Transactor`, and therefore through a real `begin`/`commit` — then
`docker compose rm -sf postgres && up -d`, then reads the same rows:

```
=== before ===                          === after ===
person : @t019probe — "Durability probe"   person : @t019probe — "Durability probe"
post   : "this must survive…" [public/ready]  post   : "this must survive…" [public/ready]
index  : 1 index row(s)                     index  : 1 index row(s)
```

It does not go over HTTP, and that is a stated limit: publishing requires an upload and MinIO
cannot be pulled here. The HTTP publish path is CI's to prove.

### T017 — six guarantees, six breaks, six reds

| The break | What went red |
|---|---|
| the conditional insert loses `do nothing` | exactly one of five racing writers wins |
| `increment` made a read-modify-write | twenty concurrent increments all count |
| `updateItem` builds from `'{}'` instead of `item` | merges, leaves attributes it was not given untouched |
| `begin`/`commit` removed | applies NOTHING when one item fails its condition |
| the index partition column forced back to `pk` | returns only items that populate the index |
| the keyset comparison dropped | pages with a cursor, and the pages do not overlap or skip |

**One of those breaks did not apply, and passed, and that is the finding.** The first attempt at
the merge break patched `    let expression = 'item';` with four spaces of indentation against a
line that has two. The replace was a silent no-op, the test passed, and **a break that never
happened looks exactly like a guarantee that holds**. Redone with an assertion that the patch
applied; it then failed as it should. A verification needs verifying.

### Three defects the contract caught that reading would not have

1. **`->>` with a `text[]` cast reads a key literally named `{followerCount}`.** The path
   parameter is a text ARRAY, which is what `jsonb_set` wants; casting the same parameter to
   `text` for `->>` asks for an attribute whose NAME is that string. No item has one, `coalesce`
   supplied 0, and **every increment started from zero**. Twenty concurrent increments came out
   as 1; `1 + -3` came out as -3. Note how it failed: quietly, and in the direction that still
   writes a plausible number.
2. **Nothing closed the pool.** The old engine spoke HTTP and had nothing to leak. Every suite
   that boots the application opened eight connections and kept them: **224 failures across 31
   suites**, all "sorry, too many clients already", which reads as a broken datastore rather
   than an unclosed handle. `PersistenceModule` now ends the pool on destroy — and the same leak
   would have followed the service into a managed tier with a connection ceiling.
3. **The catalogue seeder still wrote to DynamoDB.** 153 failures, every one "catalogue is
   empty". Obvious in hindsight and invisible beforehand: the seed is a separate script that
   nothing typechecks against the engine.

### A correction to my own count

I reported "**2 distinct conditions in the whole persistence layer**". There are **three**: 008's
comment delete guards on `attribute_not_exists(deletedAt) OR deletedAt = :null`. The count was
taken by grepping `persistence/` — in the same session in which T007a had just moved five
transaction sites INTO that directory from `modules/`, where that condition lives. Counted before
the move, quoted after it.

It cost nothing, because **the translator refuses what it does not recognise instead of
guessing**. That is the entire reason it refuses: a translator that silently dropped an
unrecognised clause would have produced a delete that looked like it worked and a comment count
that drifted from its rows.

### One registered difference, deliberate and safer

Where the ROW is absent entirely, the old engine evaluates `attribute_not_exists(deletedAt)`
against a non-existent item, finds it true, and **creates a stub**. The new one refuses. Nothing
reaches it — 008's comment delete checks the comment exists and is yours first — and the choice
is between "a stub comment row nobody asked for" and "a refusal". A migration may not make a
product decision, so this is written down rather than assumed away: it is not a decision anyone
made, it is an artifact of the engine.

### And one thing that got better on its own

`person.repository.ts` carries a long comment about the old engine applying `Limit` to the rows
it EXAMINES, *before* the filter runs — so "look at 200 people, then filter" is not "up to 200
matches", and past that many accounts a real match was invisible with the endpoint answering
200 OK and an empty list. That is why `people-search-scale` has failed on a grown local table
three times, and a fourth during this feature. **SQL applies `where` before `limit`.** The whole
class of false regression is gone.

---

## T026 — ffmpeg as a binary, and the sixth grown-table false regression

**2026-09-13.** `FfmpegMediaProcessor` executed `docker run --rm -v <tmp>:/w <image>`, which needs
a container runtime the API can reach and a temp directory the DAEMON can bind-mount. Neither
holds on a managed host (no Docker socket; a host path mounted from inside a container is the
host's path, not the container's) nor on a laptop that would otherwise need Docker Desktop
running to resize an image.

**One implementation, not a switch.** Keeping both and choosing with an env var is the shape the
four AWS adapters were deleted for. The code runs `ffmpeg`; an environment with no native binary
supplies one — `scripts/ffmpeg-shim/`, five lines that call docker — so the variation lives
outside the code where it can be read, rather than inside it behind a flag nobody exercises.
Verified through the shim here: `ffmpeg` produced a 2,161-byte JPEG and `ffprobe` read `64,64`
back off it, and `us1-exif`'s fixture builder went from failing to green in 549ms.

CI, the emulator job and `session-up.sh` install the real thing rather than relying on the runner
image shipping it — a dependency on an image's contents is a dependency on somebody else's
release notes.

### And two false regressions in one afternoon, both the same shape

The full suite went from 3 failures to 5. Neither new one was T026.

| Surface | Held | Page size | Order |
|---|---|---|---|
| `MODLOG#2026-09` (audit trail) | **105** | 100 | ascending |
| `RSTATE#open` (report queue) | **32** | 25 | ascending |

Both tests wrote one row and asserted it appeared in the FIRST PAGE of an ascending list over a
datastore shared across runs. True until the list outgrows the page, false forever after, and it
fails looking exactly like a product defect.

**The product is right in both cases.** An append-only audit read chronologically and a queue
showing the oldest open report first are both correct — an operator works a backlog from the
front. What was wrong is a test making a claim about a PAGE while meaning a claim about the LIST.

**This is the sixth occurrence** — `people-search-scale` ×3, `review-moderation` once before, and
these two. Three of the six were investigated as product defects before anyone counted the rows.
CLAUDE.md's rule, "count the table before believing a paging failure", is what makes each one cost
a minute instead of an investigation. `tests/integration/paging.ts` is the next step: **not needing
to count.** One `findAcrossPages` helper, shared rather than copied — four copies of a thing is
four places to get it wrong, which is the argument `forbidden-imports.ts` already makes for itself.

**And the fix was watched fail first, which is the only reason it is finished.** The first version
passed on a cleared partition and was about to be called done; padding the partition to 303 rows
put it straight back to red, and that run is what found the report queue as a *second* surface with
the same defect. A fix that passes on a clean table is not a fix. Final state: 13/13 against
**307** audit rows and **32** open reports, and the whole API suite back at its baseline — 2,018 of
2,021, the three failures being MinIO, which cannot run in this sandbox.
