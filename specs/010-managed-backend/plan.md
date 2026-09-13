# Implementation Plan: A Backend That Stays Up

**Branch**: `claude/pensive-goldberg-jjjni5` | **Date**: 2026-09-13 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/010-managed-backend/spec.md`

**Constitution**: **2.0.0**. This plan reverses a decision recorded in
`001/research.md` **D3** and retires **D9**. Both reversals are argued below rather than
performed quietly, because a design document that stops matching the build is how a reader is
misled six features later.

## Summary

**This is smaller than it looks, and the reason is that the seam was already there.**

Only **four files, 554 lines**, touch the datastore SDK: `base.repository.ts`,
`dynamo-client.ts`, `persistence.module.ts` and `collection.repository.ts`. The other **29
repositories inherit seven protected methods** — `getItem`, `putItem`, `deleteItem`,
`increment`, `updateItem`, `query`, `transact` — and never see the datastore at all. Reimplement
those seven and the rest follows.

**`keys.ts` does not change.** Every `USER#…`, `#PROFILE`, `MEDIA#000` stays exactly as it is,
and so does the single-table design and all 26 access patterns. What changes is the engine
underneath, not the shape of the data.

**US2 is probably configuration and nothing else.** `MinioObjectStore` is plain
`@aws-sdk/client-s3` with `getSignedUrl`, and Supabase Storage exposes an S3-compatible
endpoint at `/storage/v1/s3` that signs with SigV4. The same reasoning that made Cloudflare R2
a config-only swap applies here. **Probably is doing work in that sentence** — it gets proven
in Phase B, not assumed.

**The one decision that governs the rest** is that the datastore stops being a local
development tool pretending to be a service. That is what makes accounts possible, and it is
the whole reason 011 waits on this.

## Technical Context

**Language/Version**: TypeScript 5.9, Node 22. Unchanged.

**Primary Dependencies**: `pg` replaces `@aws-sdk/client-dynamodb` and
`@aws-sdk/lib-dynamodb`. `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` **stay** —
they talk to any S3-compatible endpoint, which is the point. NestJS, Expo and the mobile stack
are untouched.

**Storage**: One Postgres table holding the same key scheme, with the item body as `jsonb` and
the GSI keys as indexed columns. See [data-model.md](./data-model.md).

**Testing**: Unchanged suites, and that is the gate. The visibility matrix, the routing probes
and the public-route snapshot must come out **identical**. Integration tests get Postgres from
`docker-compose.yml` instead of DynamoDB Local.

**Target Platform**: A managed host with no container runtime of its own, which is why media
processing stops shelling out to `docker run`.

**Project Type**: Existing API + mobile. No new deployable, no new package.

**Performance Goals**: None new. SC-007 (publish under 30s from a phone) and SC-008 (first
request after a day under 60s) are the only numbers, and both are about the hosting, not the
query plan.

**Constraints**: **No payment method anywhere** (FR-002, FR-014). This is the binding
constraint and it eliminated every option that would otherwise be obvious. **512 MB of memory**
on the free host is the second, and it is the one most likely to bite — see the Complexity
table.

**Scale/Scope**: One owner and a few people. 500 MB of structured data, 1 GB of media, stated
in the spec's Assumptions as a ceiling rather than hidden.

## Constitution Check

*GATE: Must pass before Phase 0. Re-checked after Phase 1 — result at the bottom.*

### I. Interest Is the Unit of Meaning (NON-NEGOTIABLE) — **not engaged**

Recorded rather than omitted. Nothing about where data is kept touches how a feed is
assembled or what an interest means.

### II. Visibility Is Decided Once (NON-NEGOTIABLE) — **engaged, and this is the gate**

Every read path runs through one `VisibilityFilter`, and this feature changes what is
underneath every read path at once. That is the largest possible blast radius for this
principle.

> **Gate, mechanical**: `BASE_SURFACES.length === 16` and `baseTotal === 1488` in
> `matrix.spec.ts`, **unchanged**. `surface-routing.spec.ts` unchanged. The public-route
> snapshot in `auth-surface.spec.ts` unchanged. **If any number moves, the migration changed
> behaviour and the design is wrong.**

One specific hazard: `postInterestIndex` denormalises `visibility` into index rows precisely so
the filter can run on query results, and its fan-out carries a comment saying a drifted index
item "is exactly the SC-009 failure this class exists to make impossible". Those rows move too,
and they must move with the same guarantees.

### III. Privacy Guarantees Are Enforced Server-Side — **engaged**

Unchanged in substance, sharper in consequence: the datastore becomes a managed service
reachable from the internet rather than a container on loopback.

> **Gate**: the connection credential never enters the repository, and something **fails the
> build** if a credential-shaped string appears (FR-016). Care is not a control. This project
> already learned it once — `LOCAL_JWT_SECRET` has no default because the old one was a
> constant committed here.

### IV. Safety Ships With the Product — **not engaged**

No safety surface changes. The reporting, blocking, muting and moderation paths keep working
through the same repositories.

### V. Emulation Is Not Evidence — **engaged, and this feature IMPROVES it**

This is worth stating plainly because the instinct runs the other way.

Today, `DynamoDB Local` is a different program from AWS DynamoDB, and D9 argued no adapter was
needed because it speaks the same API. That argument was always about the API surface, not
about behaviour — and Principle V exists because those are different things.

**After this feature, the local datastore and the deployed one are the same software.** A
container running Postgres and a managed Postgres differ in configuration, not in
implementation. A green local suite becomes *better* evidence about production than it has ever
been here.

> **Gate**: the divergence register gains an entry recording what still differs — connection
> pooling, latency, and the free tier's ceilings — because "the same software" is not "the
> same environment", and the register exists to stop that elision.

### Cost and Environment Constraints — **engaged; this feature exists because of it**

> **Gate**: no payment method on file with any provider, verified by inspection (SC-004). Any
> design requiring one has failed this feature, not made a trade-off.

The clause *"every functional task MUST be completable on the local runtime profile"* is
satisfied **better** than before: Postgres is on Docker Hub, so the local stack stops depending
on quay.io — which this project's own dead-ends table records as unreachable from its
development sandbox, meaning the current stack cannot be fully started there at all.

### Development Workflow and Quality Gates — **engaged**

- *Specification precedes implementation* — spec committed before this plan ✅
- *Tests that define a contract are written first* — the contract in `contracts/` gets its
  enforcing test before the implementation it governs ✅
- *Success criteria are measured* — SC-001 and SC-005 need **seven days**, and that is a real
  schedule item rather than a box to tick on the last day ✅
- *Honest reporting* — the 512 MB video-transcoding risk is in Complexity Tracking, unresolved,
  because it is unmeasured ✅

### Reversing D3 and retiring D9

`001/research.md` D3 says, in the repository's own words: *"PostgreSQL is genuinely the better
fit for this spec and was not chosen — DynamoDB is the owner's instruction."* That instruction
is what changed, on 2026-09-13, when the owner ruled out every provider requiring a card. The
technical argument never favoured the status quo; only the instruction did.

**D9** — *"DynamoDB has no adapter; every other managed service does"* — retires with the
engine it described. Its reasoning was that an emulator speaking the same API needs no
abstraction. With one datastore and one implementation, the conclusion survives in a stronger
form: there is still no adapter, because there is still only one.

### Post-design re-check

Re-evaluated after Phase 1. **No principle is violated.** Two items are in Complexity Tracking
— both accepted costs rather than violations, and both named so a later reader does not have to
rediscover them.

## Project Structure

### Documentation (this feature)

```text
specs/010-managed-backend/
├── plan.md                    # This file
├── spec.md
├── research.md                # Phase 0 — R1..R9
├── data-model.md              # Phase 1 — the table, and what does NOT change
├── quickstart.md              # Phase 1 — how to prove it
├── contracts/
│   └── datastore-primitives.md  # The seven methods, and what each must guarantee
├── checklists/requirements.md
└── tasks.md                   # Phase 2 — /speckit-tasks, not created here
```

### Source code

```text
apps/api/src/persistence/
├── base.repository.ts          # THE SEAM — seven methods reimplemented
├── dynamo-client.ts            # → replaced by a Postgres pool
├── persistence.module.ts       # wiring
├── collection.repository.ts    # reaches past the base; needs its own attention
└── keys.ts                     # UNCHANGED — the whole key scheme survives

apps/api/src/adapters/local/
├── ffmpeg-media-processor.ts   # stops shelling out to `docker run`
└── minio-object-store.ts       # unchanged if Phase B's premise holds

infra/
└── scripts/create-local-table.ts  # → schema creation

docker-compose.yml              # Postgres replaces DynamoDB Local; MinIO stays for local
.github/workflows/ci.yml        # a Postgres service, no cloud credentials
```

**Structure Decision**: No new package, no new directory. The change is concentrated in
`persistence/` because that is where the seam already was — which is the single most important
fact in this plan and the reason it is a week rather than a month.

## Phases

| Phase | What | Independently verifiable? |
|---|---|---|
| **A** | The seven primitives over Postgres; `collection.repository.ts`; schema; compose | **Yes** — the entire suite must pass, green, locally |
| **B** | Object storage → the managed provider | Yes — media survives a restart |
| **C** | Media processing without a container runtime | Yes — a video transcodes with no Docker socket |
| **D** | Deploy; one stable encrypted address | Yes — SC-001, SC-005 over seven days |

**A is the whole risk.** B is probably configuration, C is contained, D is operations. If A
lands green, the rest follows.

## Complexity Tracking

> Two accepted costs. Neither is a Constitution violation; both are recorded so they are not
> rediscovered as surprises.

| Item | Why accepted | Alternative rejected because |
|---|---|---|
| **512 MB on the free host may not transcode video** | Photographs are the product's centre of gravity and will fit comfortably. The limit is **unmeasured**, and Phase D measures it rather than assuming either way | A host with more memory needs a payment method, which fails FR-014. If video does not fit, the honest outcomes are a documented limit or a different processing path — not a quiet failure |
| **500 MB / 1 GB free ceilings** | Sized for the owner and a few people, which is what the spec asks for | Anything larger needs a card. The spec's Assumptions state the ceiling rather than hiding it, and the edge cases require the product to fail legibly when it is reached |

## The gate baselines (T004) — measured against the engine being replaced

Recorded **2026-09-13**, against DynamoDB Local, before any code moved. These are the numbers
any failure after the swap is measured against, and the correct response to one of them moving
is to find out why — never to update the number.

| Gate | Reading | Instrument |
|---|---|---|
| `matrix.spec.ts` post assertions | **1,470 across 15 post surfaces** | `pnpm --filter @sih/api test:visibility` |
| `matrix.spec.ts` review assertions | **18 on 1 review surface** | same |
| `BASE_SURFACES.length` / `baseTotal` | **16** / **1,488** | `matrix.spec.ts:476`, `:529` |
| Visibility suite, whole | **1,522 passed, 1,522 total**, 3 suites, 6.8s | `test:visibility` |
| Integration suite | **204 passed of 205**, 48 suites of 49, 50.9s | `test:integration` |

**The one integration failure is the environment, not the product, and it is recorded rather
than rounded away.** `us1-exif.spec.ts` fails inside `MinioObjectStore.putObject` because MinIO
is not running: it is published to quay.io, which this project's development sandbox denies by
egress, and the Docker Hub mirror holds no cache of a repository that no longer exists upstream
(CLAUDE.md, dead ends). **204/205 is therefore the baseline to compare against here, and 205/205
is the baseline in CI**, which has full egress. Calling this a pass would hide the one suite that
most needs re-checking once US2 moves object storage.

### The route snapshots, verbatim

Public (13 base routes, plus whatever a fork adds through `OVERLAY_PUBLIC_ROUTES`):

```
GET /health                        GET /places
GET /interests                     GET /places/:placeId
GET /interests/similar             GET /places/:placeId/posts
GET /interests/:interestId         GET /places/:placeId/reviews
GET /interests/:interestId/posts   GET /posts/:postId
GET /people/:handle                GET /posts/:postId/comments
GET /people/:handle/posts
```

Operator (5 base routes, plus `OVERLAY_OPERATOR_ROUTES`):

```
GET   /moderation/reports        GET   /moderation/appeals
PATCH /moderation/reports/:reportId   PATCH /moderation/appeals/:appealId
PATCH /moderation/interests/:interestId
```

There is deliberately **no** `GET /share/:postId`: a share link resolves through the already
public `GET /posts/{postId}`, which re-checks visibility on every read. A separate resolution
route would be a second read path, and the link would then be the thing granting access rather
than the post's own visibility.

## Two corrections to the task list, made while executing it

Both are the same mistake and it is worth naming once: **T002 and T003 as written would have
destroyed the instrument T007 depends on.**

- **T002 said "replace the DynamoDB Local service with Postgres".** T007 requires the contract
  test to be run against the engine being replaced and watched GREEN there first, and an engine
  that cannot be started cannot be watched. `contracts/datastore-primitives.md` says as much in
  its own enforcement section: "the same test file runs against both engines where both can
  still be started". Postgres is therefore added **alongside** DynamoDB Local; the removal is
  Phase 6's business.
- **T003 said "rewrite `create-local-table.ts`".** Same problem — rewriting it leaves no way to
  create the table the old engine needs. A new `create-local-schema.ts` sits beside it, and the
  old one goes with the service it creates against.

## The seam was NOT already in the right place (found executing T008)

**This plan's Summary says the migration is contained by "seven methods on `base.repository.ts`
— four files, 554 lines". That is wrong, and the whole feature was sized on it.**

Five files outside `persistence/` build and send their own `TransactWriteCommand` against the
injected document client, at **ten call sites**, bypassing `BaseRepository.transact` entirely:

| File | Sites | What it writes atomically |
|---|---|---|
| `modules/posts/post.transaction.ts` | 3 | publish, visibility change, removal |
| `modules/posts/post-update.transaction.ts` | 2 | caption and visibility edits, with their index fan-out |
| `modules/engagement/reaction.service.ts` | 2 | react and unreact, with the count |
| `modules/engagement/comment-update.transaction.ts` | 1 | comment edit/delete, with the count |
| `modules/safety/block.service.ts` | 1 | block severance |

**Why this is worse than an undercount.** The seven-primitive contract proves
`BaseRepository.transact` applies all-or-none — which is what makes 001/FR-017 possible, a
visibility change landing on the post item and every index item or on none. It says nothing
about ten sites that never call it. A migration could have ported the base class, watched a
green contract, and shipped five unported transaction sites.

It is also a shape this project keeps paying for: **a declared seam with work happening on both
sides of it.** A feed with a second hand-rolled responder. A `VisibilityFilter` with six
hand-written predicates beside it. A notification category added to the list that *describes*
notifications and not the one that *renders* them. The seam existed; it was simply never the
only way through.

**Resolved by T007a**, added during execution: one `Transactor` inside `persistence/`, and
`one-datastore-seam.spec.ts` fails the build if anything outside that directory names the
DynamoDB SDK. Verified RED first, naming all five files, then green. `adapters/local/minio-object-store.ts`
is deliberately out of scope — it speaks `@aws-sdk/client-s3` to an S3-compatible endpoint,
which is a different service and, per R6, needs no change.

**The refactor moved no number**, which is the only reason it is safe to do before the engine
swap: visibility `1470/1470` post assertions across 15 surfaces plus `18/18` review assertions,
1,522 of 1,522 — identical to the T004 baseline.

### And the grown table caught this project for the fourth time

The first full-suite run after the contract test landed showed `people-search-scale` failing:
a real match falling outside a bounded page of the directory. The table held **7,605 items**,
against 1,596 an hour earlier. Dropped, recreated, reseeded — and it passes.

CLAUDE.md already records this exact failure three times and says to count the table before
believing a paging failure. It was counted this time, which cost a minute rather than an
investigation. **What is new is the other half**: `datastore-primitives.spec.ts` now deletes
every key it writes, because roughly fifty items a run is only "not much" until five suites do
it. Cleanup runs at the END rather than up front — clearing beforehand would leave items behind
on exactly the failing runs where the next person most needs the table not to have grown.
