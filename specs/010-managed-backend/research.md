# Research: A Backend That Stays Up

**Feature**: 010 | **Date**: 2026-09-13 | **Plan**: [plan.md](./plan.md)

Nine decisions. Two reverse earlier ones and say so. One is recorded as **unmeasured**.

---

## R1 — The datastore is managed Postgres, and DynamoDB goes

**Decision**: Supabase Postgres. Free tier, no time limit, commercial use permitted, **no
payment method required**.

**Rationale**: FR-002 is the binding requirement — reachable with no card on file anywhere. That
eliminates every hosted DynamoDB-compatible option, because all of them are reached through a
cloud account that takes a card even at zero spend. There is no exception; it was checked.

What remains that satisfies FR-002 is Postgres, and `001/research.md` **D3 already says Postgres
was the better fit for this spec** and was rejected only because DynamoDB was the owner's
instruction. That instruction changed. The technical argument never needed to.

**Alternatives considered**:

| Option | Why not |
|---|---|
| Oracle Always Free VM + DynamoDB Local | Technically ideal — zero code changes, arm64 images verified. **Requires a card** for identity verification. Fails FR-002, not on merit |
| AWS DynamoDB (25 GB always-free) | Genuinely non-expiring, genuinely free. Requires a card |
| ScyllaDB Alternator | DynamoDB-compatible, but it is **software you host**, not a hosted tier. Hosting it returns to the same problem with a heavier database |
| DynamoDB Local on a free container host | 512 MB cannot hold a JVM datastore plus the API, and free container tiers have no persistent disk |

**What this costs, plainly**: the single-table design was built for a key-value store. It
survives (R2), but anyone reading `data-model.md` later must understand they are looking at a
key-value shape implemented on a relational engine, on purpose.

---

## R2 — The key scheme survives; only the engine changes

**Decision**: One table carrying the same `pk`/`sk` scheme, the five GSI key pairs as indexed
columns, and the item body as `jsonb`. `keys.ts` is **not touched**.

**Rationale**: The 26 access patterns, the visibility index rows and 1,488 visibility assertions
are all expressed in terms of those keys. Remodelling them relationally at the same time as
changing engines would mean two large changes at once, with no way to tell which one broke
something.

This is deliberately **not** the "better" relational design. A proper normalisation is a real
future option; doing it here would put Principle II's gate out of reach, because every query
would change shape and "the totals are unchanged" would stop being a meaningful check.

**Alternatives considered**: full relational remodelling (right eventually, wrong now — see
above); a key-value extension (adds a dependency to emulate what plain columns do); keeping
`jsonb` only with no GSI columns (every query becomes a scan).

---

## R3 — Only seven methods actually change

**Decision**: Reimplement `getItem`, `putItem`, `deleteItem`, `increment`, `updateItem`,
`query` and `transact` in `base.repository.ts`. Handle `collection.repository.ts` separately.

**Rationale**: Measured, not guessed — **four files, 554 lines** touch the datastore SDK. The
other 29 repositories inherit those seven protected methods and never see the datastore.

This is the finding that makes the feature tractable, and it was found by reading rather than
by estimating. An earlier figure in this conversation put the change at ~4,163 lines by counting
the whole persistence directory; that was wrong by about 8×, and the difference is entirely
that the seam was already in the right place.

**`collection.repository.ts` is the exception** and gets its own task: it reaches past the base
class, which is why it appears in the four.

---

## R4 — Transactions get better, and one product decision must NOT follow

**Decision**: `transact` becomes a real Postgres transaction.

**Rationale**: Strictly stronger. DynamoDB's `TransactWriteItems` caps at 100 items; Postgres has
no such cap and offers real isolation rather than a batch primitive.

**AND THE 20-PERSON GROUP CAP MUST NOT CHANGE.** 005 records it as a *correctness* constraint:
a group write is 1 meta + 2N rows, so 20 people is 41 items and the next size up would be a
**silently truncated group**, not a bigger one. That technical reason disappears here — which
means the cap becomes a product decision nobody has made. Leaving it alone is the only correct
action; changing it as a side effect of a datastore migration would be exactly the kind of
quiet scope drift this project writes specs to prevent.

The spec lists it under Edge Cases for this reason, and a task asserts the cap is unchanged.

---

## R5 — `increment` becomes genuinely atomic, which fixes a known defect

**Decision**: A single `UPDATE` against the `jsonb` body.

**Rationale**: 007's verification pass found that three claims in `data-model.md` and
`research.md` matched no code, one of them **an "atomic add" that is actually a
read-modify-write and says so in its own repository comment**. Postgres does it in one
statement, so the documentation becomes true rather than aspirational.

Worth naming as a rare case where a migration *closes* a defect instead of risking new ones.

---

## R6 — Object storage is S3-compatible, so the adapter probably does not change

**Decision**: Supabase Storage, through its S3-compatible endpoint at `/storage/v1/s3`.

**Rationale**: `MinioObjectStore` is plain `@aws-sdk/client-s3` with `getSignedUrl`. Supabase
Storage speaks the S3 protocol and signs with **AWS Signature Version 4**, with an access key id
and secret. That is the same shape MinIO presents, which is why the adapter is expected to need
**endpoint, region, credentials and bucket** and no code.

**"Expected" and "probably" are load-bearing.** Phase B proves it by publishing a photograph and
reading it back through a presigned URL. If path-style addressing or the signing details differ,
that is a small change in one file — but it is a change, and it will be observed rather than
assumed.

**Alternatives considered**: Cloudflare R2 (10 GB, zero egress, genuinely better — **requires a
card**, fails FR-002); Backblaze B2 (same); keeping MinIO on the same host (nothing free with a
persistent disk can hold it alongside the API).

---

## R7 — Media processing stops shelling out to a container

**Decision**: Execute the `ffmpeg` binary directly, provided inside the API's own image.

**Rationale**: `FfmpegMediaProcessor` runs `docker run --rm -v … linuxserver/ffmpeg`, which needs
a Docker socket. **No managed host gives you one.** This is the only code change outside
`persistence/` that the move strictly requires.

**One implementation, not two.** The image provides the binary and every environment uses the
same path, which is the shape this project settled on when it deleted four AWS adapters: *"four
untested implementations selected by an env var is how a defect hides."*

**Known consequence**: `apt-get install ffmpeg` is in the dead-ends table as blocked in the
development sandbox. The image is therefore built in CI or on the host, not locally — stated
here so it is not discovered as a broken build.

---

## R8 — The API runs on a free container host

**Decision**: Koyeb. Free tier, always-on, **no card**.

**Rationale**: It satisfies FR-014 and FR-015 together — free without a card, and it does not
sleep, so SC-008's "first request after a day" is not a cold start measured in minutes.

**Alternatives considered**: Render (free tier has **no persistent disk** and sleeps after 15
idle minutes, ~1 minute to wake — fails SC-008 and needs a card by some accounts); Fly.io (no
free tier since 2024); a free VM (none exists without a card); the session server from 009
(thirty minutes, which is the problem this feature solves).

**The risk, recorded as unmeasured**: 512 MB of memory. Node plus a transcode of a real video
may not fit. Photographs will. Phase D measures it; the plan's Complexity table carries it; and
if it does not fit, the honest outcomes are a documented limit or a different processing path —
never a silent failure.

---

## R9 — CI keeps running with no cloud credentials, and gets *more* reliable

**Decision**: `docker-compose.yml` and CI run Postgres in a container. No test ever touches the
managed service.

**Rationale**: The constitution requires it: *"CI MUST run the full test suite without cloud
credentials. A test that cannot run in CI for want of a cloud account is not a test the project
relies on."*

**And it removes an existing failure.** The current local stack needs MinIO from `quay.io`, which
this project's dead-ends table records as **unreachable from the development sandbox** — so the
full stack cannot be started there at all today. Postgres is on Docker Hub. The local
development story gets better as a side effect of a change made for other reasons.

**The thing this does NOT do**: prove the managed service behaves identically. Local Postgres and
Supabase Postgres are the same software with different configuration — much stronger evidence
than DynamoDB Local ever provided, and still not proof. Hence the divergence-register entry
required by the plan's Principle V gate.

## T005 — confirming there is nothing to migrate

**Checked 2026-09-13, not assumed.** The spec lists this under Edge Cases as a thing to confirm
because if it is wrong it is catastrophically wrong, and checking costs minutes.

**Finding: there is no data to migrate.** Every datastore this product has ever been pointed at
is either a development volume or a container that is destroyed by design.

| Where the product has stored data | State | Evidence |
|---|---|---|
| **AWS (DynamoDB, S3, MediaConvert, Cognito, CloudFront)** | **Never existed.** No account, no deploy | The four `aws` adapters "had never been executed once, so they were deleted" (CLAUDE.md). `infra/` has only ever been `cdk synth`'d, which is free and needs no credentials; applying it "is never an implicit part of a task" (001/plan.md:91) and no task ever did |
| **DynamoDB Local, this sandbox** | Development data. 1,596 items, 532 KB, table created 2026-09-12 | Test fixtures from suite runs. The sandbox container is itself ephemeral — "commit and push, or lose it" — and this project has already dropped and reseeded this table twice when it grew enough to break a paging assertion |
| **CI runs** | Fresh container per run | `docker compose up -d` on a clean runner; nothing persists past the job |
| **Session servers (009)** | Destroyed by the job's own teardown | `.github/workflows/session-server.yml` runs `docker compose down -v`. The `-v` takes the named volumes with it, which is the difference between "stopped" and "gone" |

**And the decisive fact, which is recorded in four features' verification sections already:
nobody has used the product.** 003, 005, 007 and 008 each close with "Real usage: nobody has
used the product" under *Still not verified*. There are no accounts but test accounts, no posts
but fixture posts, and no photographs but generated ones.

So the migration is a **schema cutover, not a data move**. The local table is not migrated
either — it is recreated, the same way `db:create-local --recreate` already recreates it.

> **What this does NOT license.** "No data to migrate" is a fact about today, and it expires the
> first time a person who is not the owner puts a post into a deployment that stays up — which
> is precisely what this feature exists to build. A later engine change does not get to reuse
> this finding; it gets to re-check it.
