# Phase 0 Research: Interest-Centred Media Sharing

**Feature**: `specs/001-interest-media-sharing` | **Date**: 2026-09-05

Fixed by the user: **React Native** on the client, **DynamoDB** for the database.
Open for decision: backend language/framework/runtime, media pipeline, auth, search,
feed assembly strategy. Alternatives are recorded for every decision, per the user's
request, including for the two fixed choices.

---

## D1. Feed assembly: read-time fan-in, not fan-out-on-write

**Decision**: Assemble the home feed at read time by querying each followed interest's
recent-posts index in parallel and merging, with short-TTL caching of assembled pages.
Do **not** maintain materialised per-user timelines.

**Rationale**: This is forced by the spec, not by preference. FR-017 requires a
visibility change to apply "immediately everywhere the post appears", and FR-018
requires enforcement across feeds, profiles, search, share links, and notifications,
with SC-009 verifying that no post ever reaches a viewer its visibility excludes.
A fan-out-on-write design copies each post into every follower's timeline; a single
public→followers-only flip would then require finding and rewriting every copy, and
any copy missed is an SC-009 failure. Read-time assembly evaluates visibility once,
at the moment of the read, against current state — the property the spec demands.

FR-033 reinforces this: a followed person's posts must appear *only* inside interests
the viewer also follows. That is an intersection of two sets known at read time. Under
fan-out, the writer would have to compute, for every follower of the author, whether
that follower also follows this post's interest — expensive and stale the moment
either follow changes.

**Cost accepted**: read latency scales with the number of interests a person follows.
Mitigations: cap followed interests (200), query in parallel, request only the page
window from each, cache the merged page for 30-60s per viewer.

**Revisit when**: p95 feed latency approaches the 2s budget in SC-005, or the follow
cap becomes a real product constraint. The migration path is a hybrid — materialise
timelines for the high-volume interests only, keep read-time assembly for the tail,
and continue filtering visibility at read time in both paths.

**Alternatives considered**:

| Approach | Why rejected |
|---|---|
| Fan-out-on-write to per-user timelines | Conflicts with FR-017/FR-018/SC-009 as above. Also a "popular interest" fan-out storm: one post to an interest with 100k followers is 100k writes. |
| Fan-out-on-write with visibility re-checked at read | Keeps the storm, keeps the stale-copy problem for deletes and re-filing, and still needs a read-time check — the write cost buys little. |
| Precomputed global ranked feed per interest, personalised at read | Reasonable, and is effectively where the hybrid lands. Premature before there is traffic to rank against. |

---

## D2. Backend runtime: TypeScript + NestJS on ECS Fargate, with Lambda for async work

**Decision**: The synchronous API is a TypeScript **NestJS** service on **ECS Fargate**
behind an Application Load Balancer. Asynchronous work — video transcode callbacks,
image derivative generation and EXIF stripping, interest merge/re-parent jobs,
moderation scans, counter rollups — runs as **Lambda** functions triggered by S3
events, DynamoDB Streams, EventBridge, and SQS.

**Rationale**:

- **One language across the stack.** The client is React Native, so TypeScript on the
  server lets request/response types, validation schemas, and the generated API client
  live in one shared package that both sides import. On a 49-requirement surface with
  a hierarchy, a visibility model, and a feed-blending rule, a compile error at the
  boundary is worth a great deal.
- **No cold start on the read path.** SC-005 gives feeds and interest spaces a 2s p95
  to first content, and D1 puts a parallel scatter-gather inside that budget. A warm
  container with pooled AWS SDK clients spends the budget on the work rather than on
  initialisation.
- **Structure that survives the requirement count.** NestJS modules and DI give
  visibility filtering, feed assembly, and the interest hierarchy clear seams — which
  matters because FR-018 wants visibility enforced at one choke point (see D6), and a
  choke point needs somewhere to live.
- **Async work is genuinely event-shaped**, so it goes to Lambda: bursty, independently
  scaled, and triggered by events the AWS services already emit.

**Alternatives considered**:

| Option | Strengths | Why not chosen |
|---|---|---|
| **All-Lambda (API Gateway + Lambda)** | Scales to zero, cheapest at low traffic, no cluster to run. Strong second choice. | Cold starts land directly on the SC-005 read path; the feed's parallel query pattern benefits from warm connection reuse. Local development and integration testing of a 49-FR surface is more awkward. Worth reconsidering if traffic proves very spiky and the team accepts provisioned concurrency on the feed path. |
| **Go + Fargate** | Excellent concurrency for scatter-gather, low memory, fast start. | Loses the shared-types benefit with the React Native client, which is the single biggest correctness lever here. Choose this if the team is already strong in Go. |
| **Python + FastAPI** | Fast to write; best ecosystem if ML-based moderation becomes core. | No shared types with the client; weaker fit for the I/O-parallel feed path than Node or Go. Reconsider if automated content classification (an Assumption in the spec) becomes a first-class product surface rather than an assist. |
| **Kotlin/Spring or Java** | Mature, strong typing, good AWS support. | Heavier operationally and in cold start; no client type sharing. |

---

## D3. Database: DynamoDB single-table, with the honest caveats

**Decision**: DynamoDB (user-specified), modelled as a **single table** with overloaded
partition/sort keys and four GSIs. Details in `data-model.md`.

**Rationale for single-table over table-per-entity**: the access patterns are known and
enumerable from the 49 FRs, and several require fetching heterogeneous items together
(a post with its media items; an interest with its sub-interests). Item-collection reads
serve those in one query. Table-per-entity would push those into multiple round trips
inside the SC-005 budget.

**Where DynamoDB fits this spec well**:

- Post reads by interest, by author, and by id — all direct key or GSI lookups.
- Follow relationships in both directions, via a GSI on the inverted key.
- Reaction counts — atomic `ADD` updates, no read-modify-write.
- Feed queries under D1 — parallel `Query` on a sort key ordered by recency is exactly
  what the API is good at.
- Predictable cost and latency as post volume grows, which is what SC-011 asks for.

**Where it fights this spec, and the mitigation**:

| Requirement | The friction | Mitigation for v1 |
|---|---|---|
| FR-026 interest type-ahead search | DynamoDB does prefix (`begins_with`) but not fuzzy or mid-string matching. | The interest catalogue is small — hundreds of top-level, thousands to low tens of thousands of sub-interests — and changes slowly. Hold it in an in-process cache in the API, refreshed from DynamoDB Streams, and do prefix *and* fuzzy matching in memory. No search cluster in v1. |
| FR-023 near-duplicate detection at creation | Needs fuzzy comparison, which DynamoDB cannot express. | Same in-memory catalogue, compared with a normalised form plus edit distance, scoped to the target parent. SC-008 (<10% of new sub-interests later merged) measures whether this is working. |
| FR-030 merge / re-parent, carrying posts and followers | No cross-partition transaction; a merge rewrites an unbounded number of items. | Asynchronous job with a visible progress state on the interest, driven by a Lambda over paginated queries, idempotent per item. The interest is marked `merging` so reads resolve through the redirect while it runs. |
| SC-007 / SC-008 aggregate metrics | Aggregations over all posts are not a DynamoDB query. | Stream the table to S3 via Kinesis Firehose and query with Athena. Analytics never touches the operational table. |
| FR-024 sub-interest post roll-up into parent | A post must appear in two interest spaces. | Write one index item per interest the post belongs to (its sub-interest and that sub-interest's parent), so both spaces are a single `Query`. Denormalised on write, which is correct here because interest assignment changes rarely and FR-011 edits are low-volume. |

**Alternatives considered** (the user asked for these explicitly):

| Option | Strengths | Trade-off against this spec |
|---|---|---|
| **PostgreSQL (Aurora Serverless v2 / RDS)** | The best technical fit for *this particular* spec. The interest hierarchy is a recursive CTE; type-ahead and near-duplicate detection are `pg_trgm` indexes, removing the D3 catalogue-cache workaround entirely; merge/re-parent is one transactional `UPDATE`; SC-007/SC-008 are `GROUP BY` queries with no analytics pipeline. | Requires capacity planning and connection management, and the feed scatter-gather needs index care as posts grow. Cost is a floor rather than per-request. If the DynamoDB choice were reopened, this is what I would argue for. |
| **DynamoDB + PostgreSQL hybrid** | Posts, feeds, follows and counters in DynamoDB where it excels; the interest catalogue, hierarchy, and moderation queue in a small Postgres instance where relational operations are natural. | Two datastores to operate, and the hierarchy/post boundary crosses them, so some reads join in the application. Genuinely worth considering — the friction table above is almost entirely *catalogue* operations, which is a small dataset. |
| **MongoDB Atlas** | Document model fits posts and media well; Atlas Search covers FR-023/FR-026 natively; aggregation pipeline covers SC-007/SC-008. | Introduces a non-AWS-native dependency; scaling behaviour requires more operator attention than DynamoDB's. |
| **OpenSearch alongside DynamoDB from day one** | Removes the search caveat immediately, and is where search goes when post-content search arrives. | A cluster to run and a sync pipeline to keep correct, for a catalogue small enough to fit in memory. Deferred, not rejected — the v1 in-memory cache is designed so this replaces it behind the same interface. |

**Recommendation recorded**: proceeding with DynamoDB as instructed. The plan is
structured so the friction is concentrated in one place — a `CatalogueSearch` interface
and an async merge job — rather than spread across the codebase. If interest search or
moderation tooling later becomes a product surface in its own right, adding Postgres or
OpenSearch behind those seams is a contained change, not a rewrite.

---

## D4. Mobile: Expo with development builds

**Decision**: React Native via **Expo SDK** using development builds (not Expo Go),
with EAS Build for CI and app-store delivery.

**Rationale**: the media path needs the camera roll, background-capable uploads, and
video playback. Expo's `expo-image-picker`, `expo-video`, and `expo-file-system`
upload APIs cover these, and config plugins allow native modules where they do not.
Development builds keep that door open, unlike Expo Go. Over-the-air updates matter
for a consumer app iterating on a feed.

**Alternatives considered**:

- **Bare React Native CLI** — maximum native control, no Expo abstraction. Chosen
  against because every capability this spec needs is already covered, and the build
  and release tooling would be rebuilt by hand.
- **Expo Go only** — rejected outright: cannot host custom native modules, which
  forecloses background upload work that FR-008 may require.

**Deferred**: whether background upload continuation (FR-008 retry across app
backgrounding) needs a native module is a Phase 2 spike, not a blocker for the plan.

---

## D5. Media pipeline: direct-to-S3 upload, server-side derivation

**Decision**: The client requests a presigned S3 upload URL, uploads the original
directly to S3, and then creates the post referencing the uploaded object. S3 events
trigger derivation: **AWS Elemental MediaConvert** for video (HLS renditions plus a
poster frame), a **sharp**-based Lambda for images (resized variants, EXIF stripping).
Delivery is via **CloudFront**.

**Rationale**: routing media bytes through the API would put upload throughput on the
critical path of a service that also serves feeds. Presigned URLs keep bytes out of the
application entirely. FR-009's "playable video with a thumbnail" is exactly what
MediaConvert emits; the post carries a processing state until it completes, which the
spec's acceptance scenario already anticipates.

**FR-010 (EXIF/location stripping) is enforced server-side in the image Lambda**, never
on the client. A client-side strip is unverifiable and trivially bypassed by a modified
client; the requirement is a privacy guarantee, so it belongs where it can be enforced.
The original upload is retained only until derivation succeeds, then replaced by the
stripped derivative.

**Alternatives considered**: upload through the API (rejected — couples media
throughput to API capacity); client-side transcoding (rejected — inconsistent across
devices, and cannot satisfy FR-010 verifiably); third-party media services such as
Mux or Cloudinary (viable, faster to start, at the cost of another vendor and per-minute
pricing — reconsider if MediaConvert pipeline work proves a drag on delivery).

---

## D6. Visibility enforcement: one choke point, contract-tested

**Decision**: All post reads pass through a single `VisibilityFilter` boundary that
takes the viewer's identity and a candidate set, and returns only what FR-014 to FR-016
permit. No read path constructs its own visibility predicate. Share-link resolution
(FR-042) and notification fan-out use the same boundary.

**Rationale**: FR-018 lists six surfaces; SC-009 asserts no leak across any of them.
Six independently written predicates is six chances to be wrong, and the failure is
silent and privacy-affecting. One implementation with a table-driven contract test —
viewer relationship × post visibility × surface — makes SC-009 a test rather than an
aspiration.

**Consequence for D1**: this is a second reason read-time assembly wins. A choke point
only works if every read passes through it; materialised timelines bypass it by
construction.

---

## D7. Authentication: Amazon Cognito user pools

**Decision**: Cognito user pools, with hosted third-party identity providers for the
social sign-in the spec assumes.

**Rationale**: FR-001 needs accounts and sign-in; the spec's Assumptions rule out
enterprise identity. Cognito covers email/password and federated providers, integrates
with API Gateway/ALB authorisation, and avoids storing credentials.

**Alternatives considered**: **Auth0 or Clerk** — better developer experience and
nicer account-management UI, at per-MAU cost and another vendor; a strong choice if
sign-in friction proves to be where SC-001 (first post in 3 minutes) is lost. **Custom
JWT auth** — rejected; credential storage is a liability with no upside here.

---

## D8. Testing strategy

**Decision**:

- **Unit** — Jest, on the visibility filter, feed merge/ranking, and interest
  near-duplicate matching. These are the three places where the spec's logic is subtle.
- **Integration** — Jest + Supertest against the API with **DynamoDB Local** in Docker,
  covering each user story's acceptance scenarios.
- **Contract** — generated from the OpenAPI document in `contracts/`, run against the
  API and against the shared client package so client and server cannot drift.
- **Visibility matrix** — a dedicated table-driven suite for SC-009, enumerating
  viewer relationship × visibility × surface. Called out separately because it is the
  test that a whole success criterion rests on.
- **Mobile E2E** — Maestro flows for the P1 publish journey and the P2 browse journey.

**Rationale**: the spec's acceptance scenarios are already written as
Given/When/Then, so they map onto integration tests directly. Maestro over Detox for
flow coverage — YAML flows are quicker to maintain and the journeys here are short.

---

## D9. Runtime profiles: ports and adapters, so the stack runs without AWS

**Decision**: The API depends on **ports** — narrow interfaces — for every managed
service except DynamoDB, with two adapter sets selected by a `RUNTIME_PROFILE`
environment variable:

| Port | `aws` profile | `local` profile |
|---|---|---|
| `ObjectStore` | S3 | MinIO (S3 API, same SDK) |
| `MediaProcessor` | Elemental MediaConvert | ffmpeg |
| `IdentityProvider` | Cognito | local JWT issuer with a seeded key |
| `EventBus` | EventBridge + SQS | in-process queue |
| Database | DynamoDB | DynamoDB Local — **no adapter**, same API |

**Rationale**: the test suites that carry the most risk in this plan — the SC-009
visibility matrix, the FR-033 feed blending rule, the interest hierarchy roll-up,
near-duplicate matching — are logic plus DynamoDB. Requiring an AWS account to run them
would put the slowest possible feedback loop around the code most likely to be wrong.
Ports also keep CI free of cloud credentials and let a contributor run `pnpm test` on a
laptop with nothing provisioned.

**DynamoDB needs no adapter, and that is a genuine point in its favour** — DynamoDB
Local speaks the same wire API as the managed service, so the persistence layer is
byte-identical in both profiles. This offsets some of the friction recorded in §D3:
the storage layer, which is the largest and most detail-sensitive part of the backend,
has zero emulation drift.

**Verified in a Claude Code cloud sandbox** (2026-09-05), which is where this
requirement came from. Docker is not running at container start but `dockerd`,
`containerd` and `runc` are installed and the daemon starts in about a second. Docker
Hub's blob CDN is blocked by the egress policy, so a registry mirror
(`mirror.gcr.io`) is required; with it configured, `docker compose up` brings the whole
local profile up. Confirmed working: DynamoDB Local including `TransactWriteItems`
(the FR-017 atomic visibility flip across a post and its index items), MinIO presigned
`PUT` upload and readback (FR-004, FR-008), and ffmpeg producing an H.264 encode, a
poster frame and an HLS rendition (FR-009). The `quickstart.md` setup section carries
the exact commands.

**The one real divergence, stated plainly**: `MediaProcessor`. MediaConvert has no free
local equivalent — LocalStack covers it only in its paid tier — so the ffmpeg adapter is
not an emulation of MediaConvert, it is a different implementation of the same port.
Codec defaults, HLS segmenting behaviour, and failure modes will differ. Mitigations:
keep the port's contract deliberately narrow (submit a job, poll for completion,
receive renditions plus a poster frame); make both adapters satisfy the same contract
test; and run a smoke test against real MediaConvert in a staging account before
launch rather than discovering the difference in production. Do not treat green
ffmpeg tests as evidence that the MediaConvert path works.

**Two limits of the cloud sandbox that ports do not solve**, recorded so nobody plans
around them: the container has no public inbound route, so a React Native client on a
phone or simulator cannot reach an API running there; and the container is ephemeral,
reclaimed after inactivity. It is a place to build and test the backend, not to host
one. Docker in that environment is also an open feature request rather than a
documented guarantee (anthropics/claude-code#29515), so the daemon start and mirror
configuration are per-session setup steps, not something to depend on.

**Alternatives considered**:

| Option | Why not chosen |
|---|---|
| **AWS SDK calls inline, LocalStack for everything** | Fewer abstractions, and LocalStack covers S3, Cognito and EventBridge well. Rejected because MediaConvert needs the paid tier, so the divergence above exists either way — and without ports it would be spread through the codebase instead of behind one interface. |
| **Mock at the HTTP boundary** | Fast, but tests the mock rather than our own integration code. The bugs this plan fears — a missed visibility surface, a wrong index write — live exactly in that code. |
| **A shared AWS dev account for all testing** | Highest fidelity, and still the right thing before launch. Rejected as the *default* loop: minutes per iteration and a credential requirement for every contributor. |

---

## Resolved unknowns

| Unknown from Technical Context | Resolution |
|---|---|
| Backend language and framework | TypeScript + NestJS (D2) |
| Backend compute model | ECS Fargate for sync API, Lambda for async workers (D2) |
| Feed assembly strategy | Read-time fan-in with caching (D1) |
| Interest search approach | In-memory catalogue cache in v1, OpenSearch behind the same interface later (D3) |
| Media storage and processing | S3 presigned upload, MediaConvert + sharp Lambda, CloudFront (D5) |
| Authentication | Cognito user pools (D7) |
| React Native toolchain | Expo with development builds (D4) |
| Testing approach | Jest / Supertest / DynamoDB Local / Maestro (D8) |
| Running without an AWS account | Ports and adapters, `local` and `aws` runtime profiles (D9) |

No `NEEDS CLARIFICATION` items remain.
