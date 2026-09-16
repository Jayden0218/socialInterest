---

description: "Task list for 013 — The Interests Belong to the People Using Them"
---

# Tasks: The Interests Belong to the People Using Them

**Input**: Design documents from `specs/013-user-owned-interests/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/interest-naming.md](./contracts/interest-naming.md),
[quickstart.md](./quickstart.md)

**Tests**: **Included, and several are required to be watched RED before the code that satisfies
them.** Two of this feature's defects are invisible to a passing suite — a uniqueness condition
that cannot fire, and a duplicate gate that returns an empty candidate list and therefore has no
opinion. A test that has only ever passed says nothing about either.

**Organization**: by user story. The one genuine cross-story dependency is stated below rather
than pretended away.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependencies)
- **[Story]**: which user story this serves

---

## The two sequencing decisions that are not preferences

**Measure before fixing (T001).** 011 established that a read-then-write produces an occasional 2
while an absent constraint produces a reliable N — and that a fix aimed at narrowing a window is
the wrong diagnosis for the second. The count decides which this is, and it costs one test.

**US3 depends on US1, and that is real.** Deleting the catalogue before publishing can create
interests leaves the product with no way to file a post at all. The template prefers independent
stories; this pair is not, and saying so is cheaper than discovering it.

---

## Phase 1: Setup — measure what is actually wrong

- [X] T001 Write `apps/api/tests/integration/interest-name-uniqueness.spec.ts` and **run it against the product as it stands**: fire N simultaneous creations of ONE name and **count the interests that result**. Record the number in the run record. **Size the batch to the route's rate-limit capacity and clear the limiter first** — 011's concurrency test would otherwise have passed for the wrong reason, with five of six refused `429` before ever reaching the constraint, and deleting the constraint left it green. Assert no response was a 429
- [X] T002 [P] Record the BASELINE for the gates that must not move: `pnpm --filter @sih/api exec jest tests/visibility/matrix.spec.ts tests/integration/auth-surface.spec.ts`. Expect **1,488 assertions across 16 surfaces**. Write the numbers down now, so a later diff is compared against a measurement rather than a memory

**Checkpoint**: the defect is quantified and the regression gates have a recorded starting point.

---

## Phase 2: Foundational — the constraint that does not exist (BLOCKING)

**⚠️ No user story work begins until T003–T009 are done.** Every story below writes interests.

- [X] T003 In `apps/api/src/persistence/keys.ts`: add `interestNameClaim(nameNormalised)` → `pk: INAME#<nameNormalised>, sk: '#CLAIM'` and `interestSlugClaim(slug)` → `pk: ISLUG#<slug>, sk: '#CLAIM'`. **Remove `interestHierarchy`** — it indexed an interest under its parent, and there are no parents
- [X] T004 Create `apps/api/src/persistence/interest-name-claim.repository.ts` following `handle-claim.repository.ts` **exactly**: a static `claimItem()` returning a transaction item, and `release()`. 011 settled the shape and why it is static — the claim must be written in the same transaction as the thing it defends, by the repository every caller comes through
- [X] T005 Make `InterestRepository.create` transactional in `apps/api/src/persistence/interest.repository.ts`: the interest item, the name claim and the slug claim in ONE `TransactWriteItems`, each with `attribute_not_exists(pk)`. **The old `attribute_not_exists(pk)` on the interest's own key stays and still proves nothing about a name** — its `pk` carries a fresh ULID. Rename `createSubInterest` to `create`; there are no sub-interests
- [X] T006 Back-fill claims for every existing interest, and **MEASURE COLLISIONS FIRST**. The script counts interests sharing a normalised name and **refuses to write at all if that count is not zero**. 011: "a claim record defends only rows that carry one, and the 6,375 existing handles carried none — so the first human ever to choose a handle could have taken one already in use." Which interest keeps a contested name is a person's decision, not a script's
- [X] T007 **Re-run T001 and watch the number become exactly 1.** The before-and-after pair is the evidence; either alone is not
- [X] T008 In `apps/api/src/modules/interests/catalogue.cache.ts`: `findExact(name)` and `findSimilar(name, limit?)` lose their `parentId` parameter and compare against **every `active` interest** (FR-008). Delete `byParent`
- [X] T009 Write `apps/api/tests/unit/interest-similarity-is-global.spec.ts` and **watch it RED against a sibling-scoped `findSimilar`**. With no parents the candidate list is empty, `isTooSimilar([])` is false, and every name is accepted as new — **no error, no red test, no opinion**. This is the defect that would have shipped silently, so the test must be seen failing

**Checkpoint**: a name can be claimed exactly once, and the duplicate gate can see the catalogue.

---

## Phase 3: User Story 1 — I name my own subject (Priority: P1) 🎯 MVP

**Goal**: a person types what their photograph is about, and that is the end of it.

**Independent Test**: publish naming an interest nobody has used, on an installation with no
catalogue, and find the post in that interest's space afterwards.

- [X] T009a [US1] **Update the SHARED CONTRACT before the server item changes.** `packages/shared/src/types/entities.ts` defines `InterestRef` with `level` and `parent?` — the response shape every client consumes, across ~15 call sites — and `interestRefSchema` alongside it. Remove both fields there, and update the interest schema in `specs/001-interest-media-sharing/contracts/openapi.yaml` in the same commit. **This is 002's first defect in kind**: "OpenAPI said `uploadIds: string[]`; the server wanted `uploads: [...]` — any client generated from the contract 400s on every publish". It is milder here only by luck: `interestRefSchema` is never used to parse a response, so this breaks at COMPILE time rather than silently at runtime. Do it first anyway, because doing it after T010 means working through fifteen broken call sites with the contract still promising a field that is gone
- [X] T010 [US1] Delete `level` and `parentId` from `InterestItem` in `apps/api/src/persistence/interest.repository.ts`. **Deleted, not defaulted** — 006's rule, "a name that does not exist is a typecheck failure the moment somebody writes it again", which is why the `theme.color.*` shim was removed rather than left exported. A vestigial `parentId` is an invitation to re-grow the hierarchy
- [X] T011 [US1] Remove `parentId` from `createInterestSchema` in `apps/api/src/modules/interests/interest.controller.ts` (FR-002, FR-003)
- [X] T012 [US1] In `apps/api/src/modules/interests/interest.service.ts`: drop `requireTopLevelParent` **and delete `apps/api/src/modules/interests/hierarchy.validator.ts`, which becomes dead with it** — 006's rule, the same one T010 applies to `parentId`: a name that does not exist is a typecheck failure the moment somebody writes it, and a validator left in the tree is an invitation. Create flat, call the global `findExact`/`findSimilar`. Keep `namePolicy.assertAllowed` **before** the duplicate check, as it is now — a prohibited name must never be compared against the catalogue or reach the table
- [X] T013 [US1] **Publishing accepts interest NAMES and resolves-or-creates in ONE transaction**, in `apps/api/src/modules/posts/post.service.ts` (FR-004). Two requests leave a window in which an empty interest exists, and a publish that fails afterwards leaves one for ever. `runTransaction` already exists and 008/FR-051 used this exact argument for collections
- [X] T014 [US1] Refuse a name that normalises to empty, with a message naming the rule (contract §1 row 1). `normaliseName` strips everything outside `[a-z0-9]`, so this also refuses every non-Latin script — **the product is Latin-script-only for interest names, and that is a stated limitation, not a discovery**
- [X] T015 [US1] Write `apps/api/tests/integration/interest-needs-a-post.spec.ts`: fail a publish deliberately after a new name is resolved, and assert **zero** interests were created. One transaction, so it rolls back with the post
- [X] T016 [US1] Write `apps/api/tests/integration/interest-naming.spec.ts` covering contract §1 rows **1, 3, 4 and 7** — empty, joins existing (FR-007), joins a merged interest's target (FR-014), creates new
- [X] T017 [US1] `apps/mobile/src/features/publish/ComposeScreen`: name an interest by typing. **No picker over a list the product owns** (FR-001, FR-002). The interest step must still be required — FR-005, there is no uncategorised post
- [X] T018 [US1] Run `apps/e2e` over HTTP. 002's lesson is the reason this is a task: both sides generated from one document agree with each other by construction, so a contract test and a generated client cannot catch a publish whose shape changed. Only a request can

**Checkpoint**: a person can publish about anything, and the catalogue is no longer in the way.

---

## Phase 4: User Story 2 — the near-duplicates do not pile up (Priority: P1)

**Goal**: sprawl is prevented where it is cheap — at the moment of creation.

**Independent Test**: create an interest, then propose a near variant, and confirm the existing one
is offered before a second is made.

- [X] T019 [US2] Write `apps/api/tests/integration/interest-normalisation.spec.ts` for SC-003: publish with "Bouldering", "bouldering" and "  BOULDERING!! ". Expect **one** interest and three posts (FR-006). **Generated over a set of variants, not three hand-picked ones** — a hand-picked list only covers the cases somebody already thought of, which is how 004's first `auth-surface` guard missed the second occurrence of its own defect
- [X] T020 [US2] Confirm `acknowledgedSimilarTo` still gates creation with no parent in scope (FR-009, FR-010), and that `DuplicateInterestError` still returns the candidates so a client can offer "join this one instead"
- [X] T021 [US2] `apps/mobile/src/features/publish/`: when the API returns candidates, show them and offer **joining one** as the primary action, with "create it anyway" secondary. The prior research found this is where sprawl is won or lost — the interface at the moment of creation
- [X] T022 [P] [US2] Assert in a test that **no code path merges on a similarity score** (FR-011). A structural guard, because the temptation is a one-line threshold and research R4's table is the reason not to: the typo band (0.86–0.91) and the unrelated band (0.75–0.83) overlap, and a merge here is irreversible

**Checkpoint**: two people naming the same thing end up in the same place.

---

## Phase 5: User Story 3 — nothing is left over from the old catalogue (Priority: P1)

**⚠️ Depends on US1.** Deleting the catalogue before publishing can create interests leaves no way
to file a post at all.

**Goal**: no screen, requirement or sentence still describes a product where we own the vocabulary.

- [X] T023 [US3] Delete `infra/scripts/seed-catalogue.ts` and its `seed:catalogue` script (FR-017). **Every caller must go too** — `apps/e2e/support/reset.ts` calls it, and 007 lost a whole 25-minute device run to a runner still invoking a fixture that had been deleted with the requirement it served
- [X] T024 [US3] Write the migration in `infra/scripts/`: every interest holding posts survives **under its own name**, the parent edge is dropped, and seeded interests with no posts are removed (FR-020). **Children are never folded into parents** — folding moves somebody's post to a subject they did not choose, the imposition this feature exists to end. It **counts name collisions first and refuses to run if the count is not zero**
- [X] T025 [US3] Remove the parent fan-out from `postInterestIndex` writes: 001/FR-024 wrote one index row per interest in the post's EXPANDED set — the sub-interest and its parent. With no parents a post writes one row per interest it carries (FR-021)
- [X] T026 [US3] Rebuild the cold start in `apps/mobile/src/screens/PickInterestsContainer.tsx` around the most-used live interests (FR-019). **Rebuilt, not removed**: removing it lands a new account on an empty feed, which is 012/US3's unsolved problem arriving by another route
- [X] T026a [US3] **Accept and implement the colour change, which is user-visible and was nearly shipped unstated.** `apps/mobile/src/ui/interest-colour.ts:34` seeds the hue from `interest.parentId ?? interest.interestId`, so a child borrows its parent's hue, and line 46 shifts lightness by ±0.045–0.05 for a child. With no parents **every existing sub-interest changes both hue and lightness**. That is the right outcome — borrowing a parent's hue is meaningless once there are no parents, and preserving it would mean keeping `parentId` for ever, which T010 deletes precisely to stop the hierarchy re-growing. So: delete the `isChild` branch **and the matching branch in `everyInterestColour`**, because that generator enumerates 360 hues × 2 lightnesses and the second lightness becomes unreachable — leaving it would keep the contrast guard passing over half a space that can no longer occur, which is a guard losing half its subject
- [X] T027 [US3] `apps/mobile/src/features/discover/`: Explore stops browsing a hierarchy and browses what people have created
- [X] T028 [P] [US3] **Grep the COPY, not only the code** (FR-018, SC-009): `grep -rin "sub-interest\|parent interest\|choose an interest\|catalogue" apps/mobile/src apps/api/src`. 007 shipped a follow hint describing a withdrawn requirement because only the code was updated, and 008/T224 found two live defects by doing exactly this
- [X] T029 [P] [US3] Mark 001/FR-024's sub-interest roll-up **withdrawn** in `specs/001-interest-media-sharing/spec.md`, and update `CLAUDE.md`'s description of the interest model. A withdrawn requirement left described is how 007's follow hint survived

**Checkpoint**: the product's vocabulary belongs to the people using it, everywhere.

---

## Phase 6: User Story 4 — two words that mean one thing become one (Priority: P2)

**Goal**: an operator can repair a genuine synonym, and nobody's own words are rewritten.

- [X] T030 [US4] Confirm the merge job in `apps/workers/src/interest-jobs/handler.ts` still holds flat: mark `merging`, move posts, move followers, **then** `setMergedInto` (FR-012, FR-013, FR-014). The order is the requirement — a reader must never follow a redirect to content that has not arrived
- [X] T031 [US4] **The moved `postInterestIndex` rows must carry their denormalised `visibility`.** 008 recorded that a drifted index item "is exactly the SC-009 failure this class exists to make impossible", and a merge is a move across partitions
- [X] T032 [US4] Assert merging is operator-only (FR-016), and that the route's status matches the contract — 008 found `OperatorGuard` throwing 401 where the contract (`specs/001-interest-media-sharing/contracts/openapi.yaml`; there is no `openapi.yaml` at the repository root) documented 403 on every moderation route, each looking right alone
- [X] T033 [US4] Write a test that after a merge **the author's own post still displays the word they typed** (FR-015, SC-008), while reads resolve through the redirect
- [X] T034 [US4] Release the merged-away name's claim, or point it at the target, so the source's name does not stay permanently unusable. Contract §1 row 4: a person typing it lands on the **surviving** interest and does not resurrect the source

**Checkpoint**: genuine duplicates can be repaired without anybody losing their own words.

---

## Phase 7: User Story 5 — dead interests do not accumulate (Priority: P3)

- [X] T035 [US5] An interest with no posts is set `retired` and stops being browsable (FR-022). **Retired, not deleted**, so a link from somewhere the boundary has not re-evaluated does not 404 into nothing. **Say what happens to its FOLLOWERS**: a merge moves them (T030) and retirement currently does not, which would leave people following something unbrowsable while the follow still counts as a ranking signal (007/FR-030). **And decide explicitly whether `postCount` is authoritative**, or whether the rows are: it is a stored counter, and CLAUDE.md records 008 deliberately NOT copying the conversation `unreadCount` because "a count and the rows it counts are two sources of truth for one fact"
- [X] T036 [US5] Assert housekeeping never touches an interest that has posts (FR-023)
- [X] T037 [P] [US5] Decide and record what "has posts" means when the last post is hidden by its author, deleted, or removed by a moderator. **That is a visibility question and the boundary answers it, not the job** — a job that counted rows the boundary would withhold would be a second visibility decision, which Principle II forbids

---

## Phase 8: Polish & close-out

- [X] T038 [P] Confirm the visibility matrix reports the **same surfaces and the same total** as T002 recorded (FR-024, SC-011). **If a number moved, stop and find out why — never update the number**
- [X] T039 [P] Confirm the public and operator route snapshots against T002 (FR-025). Whether `POST /v1/interests` survives as a standalone route once publishing creates interests is a **deliberate, reviewed decision** (research R5), never an incidental diff
- [X] T040 [P] Confirm no state or surface introduced here shows content the boundary would have withheld, and that an empty interest space says nothing about why (FR-026)
- [X] T041 [P] Update the testID snapshot in the **same commit** as the flows requiring it, and regenerate on ADDITIONS rather than only removals — 011 found it nineteen ids stale, and a snapshot can only detect the removal of an id it knows about
- [X] T042 [P] Run `node scripts/verify-maestro-ids.mjs`. A selector matching nothing fails as a thirty-second timeout twenty minutes into a device run
- [X] T043 Run the real CI step list before pushing, not a proxy for it. Two red builds came from checking typecheck/lint/tests and assuming that covered CI
- [X] T044 Run every scenario in [quickstart.md](./quickstart.md) — **run 2026-09-16.** §1 uniqueness (1 of N), §2 the global gate, §3 case and punctuation converge, §6 the regression gates, §7 grep the copy, and §8 the whole e2e suite. §4 and §5 are covered by `interest-naming` and `interest-merge-flat`. **Two things it found**: the document expected 1,488 across 16 surfaces and the answer is 1,586 across 17 — moved deliberately by 012/T038, recorded in the document rather than quietly updated — and §7 found LIVE user-facing copy telling somebody to "create a sub-interest for it", which is 007's follow-hint defect exactly and is why that scenario exists
- [X] T045 Record the run in `docs/verification/runs/`, every criterion pass, fail or **not run** — never blank — and **count the items** rather than reading the highest number. The device tier is **not run**: no emulator here, and nothing since 011 has run on one

---

## Success criteria → the task that measures each

| Criterion | Measured by |
|---|---|
| SC-001 publish about anything, find it after | T016, T018 |
| SC-002 zero interests we created | T023, T024 |
| — contract stays true | T009a |
| SC-003 case/punctuation → exactly one | T019 |
| SC-004 concurrent creation → exactly one | T001 then T007 — **the pair is the evidence** |
| SC-005 similarity sees every interest | T009 — **watched RED first** |
| SC-006 zero automatic merges | T022 |
| SC-007 merge moves everything | T030, T031 |
| SC-008 the author keeps their word | T033 |
| SC-009 zero catalogue language anywhere | T028, T029 |
| SC-010 zero orphaned posts after migration | T024 |
| SC-011 matrix unchanged | T002 then T038 |
| SC-012 zero empty interests browsable | T035 |

## Dependencies

```text
Phase 1 (measure)
   └─> Phase 2 (the name claim + global similarity) ── BLOCKS EVERY STORY
          ├─> Phase 3 (US1 — naming)  🎯 MVP
          │      └─> Phase 5 (US3 — remove the catalogue)   ← REAL dependency
          ├─> Phase 4 (US2 — near-duplicates)
          ├─> Phase 6 (US4 — merge)
          ├─> Phase 7 (US5 — housekeeping)
          └─> Phase 8 (close-out)
```

## Parallel opportunities

- T002 with T001
- T022 with the rest of Phase 4
- T028 and T029 with the rest of Phase 5
- T037 with T035–T036
- Phases 4, 6 and 7 with each other once Phase 2 is done
- Every task in Phase 8 except T043, T044 and T045

## Implementation strategy

**Phases 1–3 are the MVP**: measure the defect, fix the constraint, and let people name their own
subjects. That alone is the owner's instruction delivered, and it is independently shippable —
the twelve still exist at that point, they simply stop being the only option.

**Phase 5 is the point of no return.** Once the catalogue is deleted and installs are migrated,
going back means restoring a taxonomy and re-parenting posts. Ship Phases 1–4, look at it, and
only then run the migration.
