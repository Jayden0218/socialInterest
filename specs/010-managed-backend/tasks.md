---

description: "Task list for 010 — A Backend That Stays Up"
---

# Tasks: A Backend That Stays Up

**Input**: Design documents from `specs/010-managed-backend/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: **Included, and not optional.** The constitution requires that where a document
declares itself a contract, the test enforcing it exists before the implementations it governs.
`contracts/datastore-primitives.md` declares itself one, and it governs every read path in the
product.

**Organization**: By user story, so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

---

## The sequencing decision that makes this migration provable

Ordinary test-first does not work here, because the behaviour already exists — it is the
*engine* that changes. A test written after the swap proves only that the new thing does what
the new thing does.

So the contract tests are written **against the engine that is being replaced, and watched
GREEN there first** (T007). That makes them a description of behaviour the product already
relies on rather than of the implementation about to be written. Only then does the engine
change — and any failure afterwards is unambiguous: **the new engine differs, in a named way.**

This is the one place where "watch it fail first" is the wrong instinct. Watching them **pass**
on the old engine is what gives them authority.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Add `pg` and `@types/pg` to `apps/api/package.json`; leave `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` in place — they speak to any S3-compatible endpoint and R6 expects them to be unchanged
- [x] T002 Replace the DynamoDB Local service with Postgres in `docker-compose.yml`, keeping the named volume so data survives `docker compose down` — and note in a comment that Postgres is on Docker Hub, which removes the quay.io dependency the dead-ends table records as unreachable from the development sandbox
- [x] T003 Rewrite `infra/scripts/create-local-table.ts` to create the `items` table and five **partial** GSI indexes per [data-model.md](./data-model.md) — partial because a GSI is sparse, and a plain index would materialise a row per item per index for items that never use them

**Checkpoint**: Postgres runs locally. Nothing uses it yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ No user story work begins until T004–T007 are done.**

- [x] T004 Record the gate baselines by running `pnpm --filter @sih/api test:visibility` and `test:integration` **against the current engine**, capturing `BASE_SURFACES.length` (16), `baseTotal` (1488, `apps/api/tests/visibility/matrix.spec.ts:476` and `:529`) and the public/operator route snapshots into `specs/010-managed-backend/plan.md`
- [x] T005 **Confirm there is nothing to migrate** — check every datastore this product has been pointed at and record the finding in `specs/010-managed-backend/research.md`. The spec lists this as a thing to confirm rather than assume, because if it is wrong it is catastrophically wrong and checking costs minutes
- [x] T006 Write the contract test for all seven primitives in `apps/api/tests/integration/datastore-primitives.spec.ts`, covering every MUST in [contracts/datastore-primitives.md](./contracts/datastore-primitives.md) — written against the abstract behaviour, never against either engine's quirks
- [x] T007 **Run T006 against the engine being replaced and watch it GREEN.** Record the output in `specs/010-managed-backend/checklists/requirements.md`. A red here means the test is wrong, not the product — fix the test before touching the engine

**Checkpoint**: The contract is a description of behaviour the product already has, proven.

---

## Phase 3: User Story 1 — What I publish is still there tomorrow (Priority: P1) 🎯 MVP

**Goal**: Data survives the restart of every process, container and host.

**Independent Test**: Publish a post. Stop everything. Start it again. The post, its caption,
its media references and its counts are unchanged.

### Implementation

- [x] T007a **[ADDED DURING EXECUTION — the plan's seam was not the only way through]** Route every multi-item write through one `Transactor` inside `persistence/`, and guard it with `apps/api/tests/unit/one-datastore-seam.spec.ts`. Five files outside `persistence/` built and sent their own `TransactWriteCommand` at ten call sites, bypassing `BaseRepository.transact` entirely — so the seven-primitive contract proved an all-or-none guarantee for a method a third of the transaction sites never called
- [ ] T008 [US1] Replace `apps/api/src/persistence/dynamo-client.ts` with a Postgres pool, reading its connection string from the environment and never from a file
- [ ] T009 [US1] Implement `getItem`, `putItem` and `deleteItem` in `apps/api/src/persistence/base.repository.ts` — `putItem`'s condition MUST be one atomic statement, because a read-then-write passes every test and fails only under the simultaneous requests it exists for
- [ ] T010 [US1] Implement `updateItem` in `base.repository.ts` as a **merge**, never a replace — an unnamed attribute must survive, which is the shape of 008's `avatarUrl` defect that survived in seven of nine places
- [ ] T011 [US1] Implement `increment` in `base.repository.ts` as a **single statement**, closing the read-modify-write that 007 found documented as atomic and implemented as not
- [ ] T012 [US1] Implement `query` in `base.repository.ts` with sort-key prefix matching, GSI variants and **keyset pagination** — and preserve sparse-index behaviour: an item that does not populate an index key MUST NOT appear in that index
- [ ] T013 [US1] Implement `transact` in `base.repository.ts` as a real database transaction, replacing the batch primitive
- [ ] T014 [US1] Port `apps/api/src/persistence/collection.repository.ts`, which reaches past the base class and is the reason four files rather than three touch the datastore
- [ ] T015 [US1] Update `apps/api/src/persistence/persistence.module.ts` to provide the pool

### Verification

- [ ] T016 [US1] Run T006 against Postgres and watch every guarantee go green for the same reasons it did on the old engine
- [ ] T017 [US1] **Verify each guarantee by breaking it**: `putItem`'s condition under concurrency, `increment` under concurrency, `updateItem` dropping an unnamed field, and a sparse index returning an item that does not populate it. Record what each said — a guard that has only ever passed is not a guard
- [ ] T018 [US1] Run the full API suite and confirm the T004 baselines are **unchanged**: 16 surfaces, 1,488 assertions, route snapshots identical. **If a number moved, find out why — never update the number**
- [ ] T019 [US1] Prove FR-001 by hand: publish a post, `docker compose down && up`, read it back. No unit test substitutes for this
- [ ] T020 [US1] Assert the **20-person group cap is unchanged** in `apps/api/tests/unit/`, with a comment explaining that its technical reason disappeared here and the product decision has not been made
- [ ] T021 [US1] Run `pnpm lint` and `pnpm typecheck` across all packages

**Checkpoint**: US1 is complete and shippable. Data persists locally, with nothing deployed.

---

## Phase 4: User Story 2 — My photographs survive too (Priority: P2)

**Goal**: Media outlives the session as surely as the caption does.

**Independent Test**: Publish a post carrying a photograph. Restart everything. It renders.

- [ ] T022 [US2] Point `apps/api/src/config/configuration.ts` at the managed storage endpoint via environment variables — R6 expects `MinioObjectStore` itself to need **no code change**, since it is plain `@aws-sdk/client-s3` with SigV4 presigning
- [ ] T023 [US2] **Prove R6's premise rather than assume it**: publish a photograph and read it back through a presigned URL. If path-style addressing or signing differs, fix it in `apps/mobile`-independent code and record what differed in `research.md` under R6
- [ ] T024 [US2] Confirm a presigned address **stops working after its expiry**, and that it is issued only after the boundary has decided the viewer may see the post
- [ ] T025 [US2] Restart everything and confirm the photograph still renders (FR-008)

**Checkpoint**: Posts and their photographs both survive.

---

## Phase 5: User Story 3 — One address, and it stops changing (Priority: P3)

**Goal**: The app is pointed at the product once, and keeps working.

**Independent Test**: Point the app at it. Come back a week later, from another network, without touching the address.

- [ ] T026 [US3] Change `apps/api/src/adapters/local/ffmpeg-media-processor.ts` to execute the `ffmpeg` binary directly instead of `docker run` — no managed host provides a container runtime, and this is the only code change outside `persistence/` the move strictly requires
- [ ] T027 [US3] Add a `Dockerfile` for the API that provides the `ffmpeg` binary — built in CI or on the host, because `apt-get install ffmpeg` is in the dead-ends table as blocked in the development sandbox
- [ ] T028 [US3] Verify a **short** video transcodes with no Docker socket available — short because `-ss 00:00:01` seeks past the end of a sub-second clip and leaves the post `failed` forever, which is the defect the `thumbnail` filter exists for
- [ ] T029 [US3] Deploy the API to the chosen host and record the address in `docs/verification/hosted-runbook.md`
- [ ] T030 [US3] Confirm the address is encrypted and reachable from a phone on an unrelated network (FR-011, FR-012)
- [ ] T031 [US3] Measure SC-007 from the phone: publishing a post carrying a photograph completes in **under 30 seconds**
- [ ] T032 [US3] Measure SC-008: after 24 hours of no use, the first request is served in **under 60 seconds**
- [ ] T033 [US3] **Measure whether 512 MB transcodes video.** Complexity Tracking records this as unmeasured. Record the answer either way — a documented limit is an acceptable outcome; a silent failure is not

**Checkpoint**: All three stories functional. The product has an address that does not change.

---

## Phase 6: Polish, Verification & Cross-Cutting

- [ ] T034 [P] Add a guard that **fails the build** if a credential-shaped string appears anywhere in the tree (FR-016) — and verify it red against a planted fake, because care is not a control
- [ ] T035 [P] Replace the DynamoDB service with Postgres in `.github/workflows/ci.yml`, with **no cloud credentials** anywhere in it (FR-007)
- [ ] T036 [P] Add the Principle V divergence entry in `docs/verification/divergence-register.md` recording what still differs between local and managed Postgres — pooling, latency, and the free tier's ceilings — and confirm `pnpm verify:register` passes
- [ ] T037 [P] Update `001/research.md`: **reverse D3** with the date and the reason, and **retire D9** with the engine it described. A design document that stops matching the build is how a reader is misled six features later
- [ ] T038 [P] Update `CLAUDE.md`: the datastore, the local stack, and the fact that the quay.io MinIO dependency is gone from the datastore path
- [ ] T039 Confirm **SC-004 by inspection**: no payment method on file with any provider used
- [ ] T040 Walk [quickstart.md](./quickstart.md) end to end and fix the document wherever reality disagreed with it
- [ ] T041 Record the run in `docs/verification/runs/` with every criterion pass, fail or **not run** — never blank, and **count the items** rather than reading the highest number, which this project has got wrong twice
- [ ] T042 **After seven days**, confirm SC-001 and SC-005 and update the record. Until then they are `not run`, and saying otherwise would be the kind of rounding-up these records exist to catch

---

## Success criteria → the task that measures each

| Criterion | Measured by | Instrument |
|---|---|---|
| SC-001 — a post readable 7 days later | **T042** | The phone, after seven actual days |
| SC-002 — suite passes with zero cloud credentials | T035 | CI |
| SC-003 — visibility table unchanged | T018 | `matrix.spec.ts` against the T004 baseline |
| SC-004 — zero payment methods | T039 | Inspection |
| SC-005 — 7 days, address never retyped | **T042** | The phone |
| SC-006 — zero blank media | T023, T025 | Presigned read-back |
| SC-007 — publish under 30s | T031 | Timed from the phone |
| SC-008 — first request after a day under 60s | T032 | Timed |

**SC-001 and SC-005 cannot be rushed**, and no task pretends otherwise.

---

## Dependencies & Execution Order

- **Setup (T001–T003)**: no dependencies
- **Foundational (T004–T007)**: needs Setup; **blocks everything**. T007 in particular — swapping the engine before the contract is proven on the old one throws away the only unambiguous signal this migration has
- **US1 (T008–T021)**: needs Foundational. T008 before T009–T013; T009–T013 are the same file and **strictly sequential**
- **US2 (T022–T025)**: needs US1 (a post must persist before its photograph can be shown to)
- **US3 (T026–T033)**: T026–T028 are independent of US1 and US2 and **can run in parallel with either**. T029–T033 need all three
- **Polish (T034–T042)**: needs the phases it verifies. T042 is seven days after T029

### Parallel opportunities

- **T026–T028 (ffmpeg) are genuinely parallel with US1 and US2** — a different file, a different concern, no shared state. The only real parallelism in this feature
- T034–T038 — different files
- **Not parallel**: T009–T013 all edit `base.repository.ts`. Single-owner file, the same rule this project records for `matrix.spec.ts` and `ci.yml`

---

## Implementation Strategy

**MVP is US1 alone** — and it is worth having alone. A datastore that survives a restart on a
developer machine is the same datastore that survives a week in a managed service, and proving
the first is what makes the second credible.

**T007 is the hinge of the whole feature.** Everything before it prepares; everything after it
depends on having an unambiguous signal. Skipping it would leave every later failure ambiguous
between "the new engine differs" and "the test was always wrong".

**Do not report this feature complete before T042.** Seven days is seven days, and "it
persists" is not observable in an afternoon.
