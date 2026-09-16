# socialInterest — agent guide

Interest-centred media sharing app. **Spec-driven**: the specs are authoritative and the
code implements them. Built with [spec-kit](https://github.com/github/spec-kit).

Read before doing anything substantive:

| File | What it settles |
|---|---|
| `.specify/memory/constitution.md` | **Binding rules.** v2.0.0, 5 principles, 2 NON-NEGOTIABLE |
| `specs/001-interest-media-sharing/spec.md` | 49 FRs, 12 SCs, 6 user stories |
| `specs/001-interest-media-sharing/plan.md` | Stack, structure, cost posture |
| `specs/001-interest-media-sharing/research.md` | 9 decisions (D1–D9) **with the alternatives already weighed** |
| `specs/001-interest-media-sharing/data-model.md` | DynamoDB single-table design, 20 access patterns |
| `specs/001-interest-media-sharing/contracts/` | OpenAPI + the visibility matrix contract |
| `specs/001-interest-media-sharing/tasks.md` | 172 tasks, T001–T172, ordered |
| `specs/007-ranked-feed-redesign/` | Ranked feed + redesign; all 8 phases implemented |
| `specs/012-ui-states-and-flows/` | Loading/empty/failed states, the flows, Explore, the action sheets |
| `specs/013-user-owned-interests/` | **The current feature.** Interests are user-owned, flat and hashtag-like; the curated twelve are gone |
| `design/007-ui/` | The **approved** design, 20 artboards. Settled — implement, do not reopen |
| the five seam READMEs — `apps/api/{src,tests}/overlay/`, `apps/mobile/src/overlay/`, `apps/mobile/src/screens/`, `contracts/` | **The overlay seams.** What a private downstream fork owns, and what that does not relax |

Do not re-litigate a decision in `research.md` without reading why it was made. Several
look arbitrary and are not — see "Decisions that look wrong but aren't" below.

## Hard rules

**Cost — the owner's standing instruction.** No task may provision billable cloud
resources without explicit, specific approval. Approval for one deploy is not approval
for the next. Everything runs on the `local` profile: **Postgres**, an S3-compatible
object store, ffmpeg and a local JWT issuer, all in Docker, no cloud account. IaC may be written and `cdk synth`'d
(free, no credentials); **applying it is never an implicit part of a task.**

**AWS was dropped as the deployment target on 2026-09-05.** The four `aws` adapters
(S3, MediaConvert, Cognito, CloudFront) had never been executed once, so they were
deleted rather than left behind a profile switch — four untested implementations
selected by an env var is how a defect hides. There is now **one implementation per
port**, and it is the one every test exercises. `RUNTIME_PROFILE` accepts `local`
only and says so if given anything else.

The ports stay. They keep the media pipeline and identity check out of the modules
that use them, and they are where a second implementation would go. **If one is ever
added, Principle V applies again**: register the divergence and verify the production
path before release. Deleting the adapters removed an instance, not the rule.

Consequence worth naming: **there is still no production hosting story.** 010 replaced
the emulator with the real engine — that is a different problem solved — but a Postgres
container on loopback is not a deployment either, and `infra/` still describes an AWS
stack that nothing targets. `D-010-1` in the divergence register names what differs
(pooling, latency, free-tier ceilings) and is open and unverified. Both are open
questions, not settled ones.

**Constitution, in brief** (read the file for the binding text). **Amended to 2.0.0 on
2026-09-08** — Principle I was rewritten and Principle II strengthened, so anything in this
file or in `specs/001-*` describing the feed as COMPOSED FROM FOLLOWED INTERESTS is
describing a product that no longer exists:

1. *Interest Is the Unit of Meaning* (NON-NEGOTIABLE) — every post is filed under an
   interest and every space is browsed by one. **The FEED is assembled from what a person
   DOES, not from what they subscribed to** (007). The old wording — a person-follow must
   never widen a feed beyond followed interests, 001/FR-033 — is **withdrawn**, because a
   ranked feed has no followed-interest set to be widened past. What survives is that a
   follow must visibly mean something: 007/FR-029, a bounded boost that reorders and never
   admits.
2. *Visibility Is Decided Once* (NON-NEGOTIABLE) — one `VisibilityFilter`; every read
   path goes through it; every surface enumerated in the matrix contract. **2.0.0 adds:
   ranking selects candidates, the boundary decides.** The composed feed satisfied this by
   ACCIDENT — it read only subscribed partitions, so its candidate set was already
   viewer-scoped. A ranked feed reads across the catalogue, so the position of the boundary
   is now a contract (`007/contracts/ranking-boundary.md`) with a build-failing dependency
   guard behind it (`ranking-cannot-admit.spec.ts`).
3. *Privacy Guarantees Are Enforced Server-Side* — and tested via the path a hostile
   client would take, not the well-behaved one.
4. *Safety Ships With the Product* — reporting/blocking/moderation is a release gate,
   not polish. US1–US6 alone must not ship publicly.
5. *Emulation Is Not Evidence* — a green local suite against a different implementation
   is not proof the production path works.

## The overlay seams (2026-09-11) — a private fork tracks this repository

The owner is carrying a **private downstream fork** with its own UI and its own backend
features, while general work stays here and the fork syncs down. This repository is
upstream and never pushes to it.

**One rule, everywhere: upstream ships an EMPTY overlay, the fork fills it in, and the
two sides never edit the same lines.**

| Seam | A fork owns |
|---|---|
| `apps/api/tests/overlay/` | visibility surfaces, routing probes, public/operator route snapshots |
| `apps/api/src/overlay/modules.ts` | Nest modules, spread into `AppModule.imports` |
| `contracts/openapi.overlay.yaml` | added paths and schemas, merged by `packages/shared/scripts/contract.ts` |
| `apps/mobile/src/overlay/palette.ts` | the brand |
| `apps/mobile/src/overlay/screens.tsx` | added routes (`{ name: 'overlay', screen }`) |
| `apps/mobile/src/screens/<Name>Container.tsx` | a replaced screen — swap the file, the barrel is untouched |
| `keys.ts`'s `X#` namespace | every overlay row in the single table |

**Where a literal stays pinned, it is pinned against the BASE and the composed
expectation is derived.** `matrix.spec.ts` still asserts `BASE_SURFACES.length === 17`
and a `baseTotal` of 1,586 — raising either is still a deliberate, reviewable edit. What
it no longer does is collide with a fork raising the same literal for a surface of their
own. Same for the route snapshot, which is still exact in BOTH directions.

**Nothing here relaxes Constitution II.** An overlay surface is a row in the same
decision table decided by the same `VisibilityFilter`, and `surface-routing.spec.ts`
still demands a probe proving it consults the boundary before the matrix will count it.
`visibility.filter.ts` is the one file where "just edit it in the fork" is off the table.

**Three kinds of divergence, and the order matters.** (1) Adding behaviour → a new module
in the overlay, near-zero conflict. (2) Changing behaviour → extract a port in
`apps/api/src/ports/` here and bind a different adapter there; zero conflict, and the
extraction improves this repository on its own merits. (3) Editing shared code → a
permanent conflict on that file, bought deliberately. **Reach for 2 before 3.**

**Principle V applies to the fork.** A green run here says nothing about the composed
downstream build; a private overlay IS a second implementation selected by config, which
is the shape the four AWS adapters were deleted for. The fork runs the suites against its
own composition and registers the divergence.

### Two lessons this cost, both general

- **An empty overlay cannot tell a working seam from a broken one.** Upstream's overlays
  are empty forever, so every seam would be green here and broken at the fork's first
  use — the declared-half-with-no-other-half shape this file records six times already.
  Five suites therefore drive the seams NON-EMPTY: `overlay-composes`, `contract-overlay`,
  `overlay-modules`, `palette-overlay`, `screen-overlay`. Every refusal was also watched
  RED (an unprobed surface, a name collision, a base key in `X#`, a removed
  `...OVERLAY_MODULES`, a removed `case 'overlay'`, a palette override that did nothing).
- **A GUARD CAN LOSE ITS SUBJECT AND PASS.** `hooks-before-return.test.ts` read
  `screens/index.tsx` BY NAME. Splitting the containers out left that path pointing at a
  barrel of re-export lines: no `export function`, so no blocks, so no offenders, so
  GREEN — in the same run that reported 253 mobile tests passing. It did not fail when its
  subject moved out from under it, which is worse than failing. It reads the directory now
  and asserts it found more than twenty files, because `expect(offenders).toEqual([])` is
  vacuously true over an empty list. **When you move files, check what named them.** Every
  other source-scanning guard walks directories and followed the move on its own.

### Where the palette override lives, and why not where you would look

`ui/theme.ts` holds `activePalette` and is the obvious place. It is the WRONG layer: the
contrast, one-accent and interest-colour guards import `light`/`dark` from `ui/tokens.ts`,
so an override above that would leave a fork's palette rendering in the app while every
accessibility check still measured this repository's. Two sources of truth for one fact —
006's "white cards inside dark green chrome", by another route. It resolves in
`tokens.ts`, at the definition point, so **a fork's palette is held to the same contrast
floor** and `palette-overlay.test.ts` proves that by driving an illegible palette through
the rule and asserting it FAILS.

### Still open on the fork

Port extraction is not done — it needs the list of backend behaviours the fork intends to
change, because extracting a port nobody binds a second adapter to is just indirection.
None of the seams has been exercised on a DEVICE; the empty overlay is a no-op, so run 59
still stands for the product, but that is not evidence about a populated overlay.

## Decisions that look wrong but aren't

- **Read-time feed assembly, not fan-out-on-write** (D1). Forced by FR-017 + SC-009: a
  visibility flip must land everywhere immediately, which materialised timelines cannot
  guarantee. Do not "optimise" this into precomputed timelines.
  **Measured 2026-09-05, attributed (spec 002 R1)**: the ceiling is
  **DynamoDB Local**, not the design. `bench:ceiling` measured the three limits
  apart — generator 187,439 req/s, **emulator 827 req/s**, application shape with
  a stubbed datastore 5,574 req/s. **Re-measured 2026-09-06 against the durable
  (disk-backed) stack**: generator 356,276, **datastore 882**, application 9,475.
  The datastore was then the lowest ceiling by an order of magnitude, so the
  conclusion was unchanged and neither figure says anything about D1.
  **RE-MEASURED 2026-09-16 AGAINST POSTGRES, and the order of magnitude is
  gone**: generator 366,725, **datastore 4,205**, application 4,342. The engine
  moved (010) and the bench had NOT — it was still timing DynamoDB Local and
  printing the figure labelled "datastore", which is the mislabelling this
  bench's own harness refuses a measurement for. Postgres is ~4.8x the
  emulator's ceiling and now within 3% of the application's, so "the datastore
  is the constraint" is no longer a safe reading: the two are level, and an
  attribution at 4,205 vs 4,342 is inside the noise. **It still says nothing
  about D1** — a container on this machine is a stand-in for a managed database
  exactly as the emulator was for provisioned DynamoDB, which is why
  `harness.ts`'s `STAND_INS` list had to be extended to catch it (it would
  otherwise have classified a local Postgres figure as a PRODUCTION datastore).
  `bench:feed-load`, now driven over HTTP, shows
  throughput **flat at 6-7 req/s** across concurrency 1→100 while p95 rises
  368ms→6,463ms: a saturated dependency, not an algorithm out of headroom.
  At rest the feed is comfortable — p50 183ms at the 200-follow cap over 100k
  posts. **001's p95 11.8s figure measured the emulator and must not be cited as
  evidence about D1**; neither may this run. `002/SC-002` (10,000 concurrent) is
  **unverified** and only a provisioned-DynamoDB run can close it — gated on the
  owner's approval. The D1 hybrid is **not warranted on this evidence**; if a
  later run does implicate the design, the hybrid holds candidate references with
  `VisibilityFilter` still at read time — **not** fan-out-on-write, which FR-017
  and SC-009 still forbid.
- **`VisibilityFilter` is a top-level module, not a helper in `posts/`** (D6). Six
  hand-written predicates is six silent leaks. Never inline a visibility check.
- **THE DATASTORE IS POSTGRES, and D3 IS REVERSED** (2026-09-16, 010/T037). One table —
  `items(pk, sk, item jsonb, gsi1pk … gsi5sk)` with five partial indexes — so `keys.ts`,
  the twenty-nine repositories and every access pattern in `data-model.md` came across
  unchanged. The deciding argument is Constitution V's standing instance: **DynamoDB's
  local form is an emulator, PostgreSQL's local form is PostgreSQL**, which is why
  002/SC-002 had to be withdrawn — every local load figure measured the emulator's 827
  req/s ceiling rather than the product. **D9 is RETIRED** with it: there is no `aws`
  profile and the "no adapter, same API" reasoning was about the engine that is gone.
  The other ports stay and Principle V still applies to them.
- **Postgres has a SEAM, not a port**, and it is `BaseRepository` plus `Transactor`.
  `one-datastore-seam.spec.ts` fails the build if anything outside `persistence/` names
  the datastore SDK — it was watched RED first, naming five files that built their own
  transactions and bypassed the base class entirely.
- **DYNAMODB LOCAL IS OUT OF `docker-compose.yml` (2026-09-16, 010/T035), AND FOUR THINGS
  WERE STILL READING IT.** The seam guard above covers `src/`, so it had nothing to say
  about a test, a script or a bench — and every one of the four was pointed at a container
  the product stopped writing to when the engine changed:
  - **`apps/e2e/durability/durability.spec.ts`** queried the outstanding-event partition
    with the AWS SDK. It is the only one that failed LOUDLY (`toHaveLength(1)` against an
    empty answer), and the clean-up assertion in the same case — `toHaveLength(0)` — is
    the half that would have passed over anything at all.
  - **`apps/api/scripts/backfill-conversation-state.ts`** reached `repo.doc` through an
    `as unknown as { doc, tableName }` cast. `doc` has not existed since the swap, so the
    first line of its loop would have thrown — and **the cast is why it typechecked**. A
    cast asserts a shape instead of reading one, which is 013's `smoke:boot` defect in a
    second place. Repaired and dry-run: 36 conversations scanned, 11 groups skipped, 0
    repaired.
  - **`bench:ceiling` and `bench:feed-load`** timed DynamoDB Local and printed the number
    **labelled as the datastore** — in the two files whose entire subject is what a figure
    is a figure about. See the re-measurement under D1 above.
  None of them was found by anything failing. They were found by grepping for the retired
  engine, which is the "grep the COPY, not only the code" habit applied to a dependency.
  **`harness.ts`'s `STAND_INS` had to gain `postgres-local`, `localhost` and `127.0.0.1`**:
  Postgres is not an emulator, so the temptation is to stop calling a local run a stand-in
  — and the guard would then have classified a laptop container as a PRODUCTION datastore.
  Silent, and in the direction that flatters the number.
- **THE API HAS A `Dockerfile` (010/T027), IT RUNS `tsx`, AND IT WAS BUILT AND RUN
  BEFORE BEING CALLED DONE.** Render's native Node runtime has no ffmpeg, so a Node
  service there would accept an upload, fail every transcode and leave every post
  `pending` — 002's fourth defect exactly. It runs `tsx src/main.ts` rather than a
  `tsc` build because CI and `smoke:boot` boot under tsx for a stated reason, and a
  `dist/` would make the deployed path a SECOND runner nothing has exercised.
  **The first version built green and the container died in under a second**:
  `apps/api/tsconfig.json` extends `tsconfig.base.json`, which nothing copied into
  the image, so tsx could not learn `experimentalDecorators` and esbuild refused
  every Nest decorator in the application. Reading the file would never have shown
  it. Verified after the fix: `GET /v1/health` 200, `GET /v1/interests` 200, and
  `API listening on 0.0.0.0:8099` — bound to the platform's `PORT`, not 3000.
  **The `apt-get` layer is UNVERIFIED** (Debian answers 403 here), which is the
  one layer that puts ffmpeg in the image.
- **`API_PORT`, THEN `PORT`, THEN 3000.** The service read only `API_PORT`, so on a
  host that injects `PORT` it would have bound 3000 while the platform probed
  something else — a deploy that goes green and answers nothing, which is the
  failure `main.ts`'s own bind comment describes two files away.
- **FIVE DEAD RUNTIME DEPENDENCIES IN `apps/api`, ~11.6 MB**, all AWS:
  `client-cognito-identity-provider` (4.2M), `client-mediaconvert` (4.2M),
  `client-dynamodb` (2.7M), `aws-jwt-verify` (436K) and `cloudfront-signer` (84K) —
  zero importers between them, left behind when the four AWS adapters were deleted
  and when 011 replaced Cognito with email and password. `lib-dynamodb` moved to
  devDependencies: `transactor.ts` imports a TYPE from it, which is erased.
  Removing a dependency nothing imports is free; noticing it is not, and it took
  writing a Dockerfile for a 512 MB host to make anybody look.
- **FIVE MORE STALE READERS IN THE FIXTURES AND THE INFRA SCRIPTS (2026-09-16)**, all
  the same shape as the four above and all found by running things rather than by
  reading them:
  - **`verify:local` was the worst of them.** It did a `TransactWriteCommand`
    against DynamoDB Local, so after the swap the script whose entire job is to
    say the local profile works would have PASSED by exercising a container the
    product never talks to. It reads Postgres now and answers **4/4**.
  - **`seed:load` was stale in TWO directions at once**: DynamoDB `BatchWrite`,
    AND a hierarchy — it queried `gsi3` for `PARENT#ROOT` and gave every seeded
    interest a `level: 'sub'` and a `parentId`, which 013 deleted. It could not
    have run, and had it run it would have seeded rows nothing reads.
  - **Four fixtures still shelled out to `docker run` for ffmpeg** — the e2e
    media fixture, `seed-demo`, `capture-screens` and `verify:local` — after
    T026 moved the PRODUCT off it. Half a fix. They all resolve `ffmpeg` the way
    the product does now, so `scripts/ffmpeg-shim/` stays the one place the
    container variation lives.
  - **`create-local-table.ts` and `db:create-local` are deleted**, with the
    DynamoDB SDKs from `infra`. The command survived in **eight** instructional
    documents, `.env.example` among them.
- **`.env.example` HANDED YOU A FILE THE API REFUSES TO BOOT WITH.** `cp
  .env.example .env.local` is the README's second line; it wrote
  `LOCAL_JWT_SECRET=dev-only-not-a-real-secret`, which is the published value
  003/FR-007 makes the service refuse BY NAME, and it carried no `DATABASE_URL`
  at all. It also still described an `aws` profile, Cognito and MediaConvert —
  all deleted. Rewritten.
- **010/T028 IS VERIFIED, AND "NO DOCKER SOCKET" WAS MADE LITERAL**: `DOCKER_HOST`
  pointed at a path that does not exist, a real static ffmpeg on `PATH`
  (extracted from `mwader/static-ffmpeg`, since `linuxserver/ffmpeg`'s binary
  needs libraries this sandbox has not got). `publish-video` **3/3** — uploaded,
  transcoded, `ready`, poster frame, readable by a permitted viewer — and
  `verify:local` 4/4. The FIRST attempt failed with `Command failed: docker run
  ...` and **that was the harness**, which is how the four fixtures above were
  found.
- **`pnpm token` HAS NOT WORKED, AND A DOZEN DOCUMENTS TELL PEOPLE TO RUN IT.**
  pnpm has a BUILTIN `token` command (npm auth tokens) and it shadows a package
  script of that name **silently** — `pnpm token` answers
  `npm error 401 Unauthorized - GET https://registry.npmjs.org/-/npm/v1/tokens`,
  which reads as an npm problem rather than as "your script never ran". The
  laptop runbook, 011's quickstart, `seed-demo.sh`'s own usage line and
  `mint-token.sh`'s own "copy to clipboard" hint all named it. It is
  **`pnpm mint:token`** now: a colon-namespaced script name cannot collide with a
  builtin. Found by trying to re-seed the demo data, not by reading anything.
- **`seed:load` WRITES INTO THE TABLE EVERY SUITE USES.** 200 posts was enough to
  turn `008/US13 FR-043` red in the full API suite while it passed alone —
  the grown-table false regression for the fifth time, and the first one this
  project caused deliberately. `db:create-local-pg --recreate` afterwards.
- **`config.dynamo.endpoint` and `.region` are DELETED; `tableName` is NOT**, and the
  difference is worth keeping. The first two had zero readers and sat in the file every new
  setting is copied from, which is how two of the four above got pointed at port 8000.
  `tableName` is in twenty-nine repository constructors and in every `TransactionItems`
  entry's `TableName`, so removing it is the second large diff its own comment warns about
  and no Phase 6 task asks for it. Recorded as outstanding rather than quietly done.
- **Interest search uses an in-memory catalogue cache, not OpenSearch** (D3). The
  catalogue is small and slow-changing. OpenSearch replaces it behind the same interface
  when post-content search arrives.

## Environment: cloud sandbox (Claude Code on the web)

Docker **works** here, but two setup steps are needed and **neither survives a container
reset**:

```bash
# 1. Mirror first — Docker Hub's blob CDN is blocked by egress policy
mkdir -p /etc/docker
echo '{ "registry-mirrors": ["https://mirror.gcr.io"] }' > /etc/docker/daemon.json

# 2. Start the daemon detached. A bare `dockerd &` is reaped with its parent shell
#    and every later command then sees a dead socket.
setsid nohup dockerd > /var/log/dockerd.log 2>&1 < /dev/null &
```

Verified working: `docker compose` with Postgres + an S3-compatible store, presigned S3 upload,
`TransactWriteItems`, and ffmpeg producing H.264 + poster frame + HLS.

**One real limit**: the container is ephemeral. Commit and push, or lose it.

**The inbound-route limit is NOT absolute — I got this wrong once, don't repeat it.**
Nothing can connect *in* to the sandbox directly, but a reverse tunnel is an *outbound*
connection and would work. Tested 2026-09-05: `cloudflared tunnel --url ...` downloads and
runs fine here and fails at exactly one point —

```
ERR Host not in allowlist: api.trycloudflare.com.
    Add this host to your network egress settings to allow access.
```

That is the environment's **network access level**, not the architecture. The default is
`Trusted` (package registries plus a fixed allowlist); a `Custom` level takes your own
domain list. Allowlist `api.trycloudflare.com` and the argotunnel edge and a phone on any
network could reach an API running here. Likely needs `--protocol http2` so the edge
connection goes over TCP/443 rather than QUIC, through the proxy. **Untested past the
first hop** — I could not change the allowlist myself.

**Update 2026-09-05: the owner set the environment to a custom allowlist**, and an
Android APK now builds end to end in the sandbox — `expo prebuild`, the Android SDK
from `dl.google.com`, JDK 17 from GitHub (Gradle needs 17, the image has 21 and its
own toolchain download is blocked), then `assembleRelease`. See
`docs/verification/tier-b-runbook.md` for the exact recipe. Sizes: 104 MB debug with
all ABIs, 35 MB arm64 debug, **20 MB arm64 release**.

**The tunnel still does not work — RE-MEASURED 2026-09-13, and half of what this
paragraph used to say has expired.**

What changed: `api.trycloudflare.com` answers **405** on a DIRECT connection now, not
`403 x-deny-reason: host_not_allowed`. 405 is Cloudflare's own answer to a `GET` on
that endpoint, so the request reached the real server — **the host allowlist opened**.

What did not change, and is the whole blocker: cloudflared's edge link is a raw TCP
dial to **port 7844**, which it makes with `--protocol http2` exactly as it does with
QUIC. Run here on 2026-09-13:

```
13:38:06  address issued: https://sun-tier-losses-nokia.trycloudflare.com
13:38:21  ERR Unable to establish connection with Cloudflare edge
          error="DialContext error: dial tcp 198.41.200.13:7844: i/o timeout"
```

Fifteen seconds between a usable-looking address and the failure — which is why
`open_tunnel` in `scripts/session-up.sh` waits for a registered connection and then
probes end to end. An address nobody has reached is not an address.

**And the ngrok candidate this paragraph used to name is ruled out too**, by the same
measurement: `connect.ngrok-agent.com` and `localtunnel.me` both answer `000` through
the proxy and direct. The hosts are not reachable at all, so an agent that honours
`HTTPS_PROXY` has nothing to honour it towards.

**So: nothing can tunnel out of this sandbox, and the reason is a PORT, not a host.**
Tunnels work fine on a GitHub runner, which is why 009's session server lives there.

Historical note, for an emulator: `dl.google.com` was blocked by the default allowlist, so
the SDK would not even download. If it were allowed, the emulator would still have no
`/dev/kvm` and the kernel has `CONFIG_ANDROID_BINDER_IPC` unset, so redroid is out and
only slow software emulation (`-no-accel -gpu swiftshader_indirect`) remains. iOS is
impossible regardless — the Simulator is macOS-only.

### Known dead ends — already tried, don't repeat

| Attempt | Result |
|---|---|
| `dynalite` (pure-JS DynamoDB) | **No `TransactWriteItems`** — the exact op FR-017 needs. Unusable. |
| DynamoDB Local from `d1ni2b6xgvw0s0.cloudfront.net` | 403, egress policy. Use `s3.us-west-2.amazonaws.com/dynamodb-local/dynamodb_local_latest.tar.gz` |
| `apt-get install ffmpeg` | Fails, Debian repos blocked. Use the `linuxserver/ffmpeg` container |
| MinIO binary from `dl.min.io` | 403. Use the `minio/minio` image |
| `minio/minio` on Docker Hub | **The repository is GONE from Docker Hub** (hit 2026-09-11), not just a tag. `hub.docker.com/v2/repositories/minio/minio/` answers 404 and the `minio` namespace lists 20 repositories, none of them `minio`. MinIO publishes to **quay.io**, so `docker-compose.yml` uses `quay.io/minio/minio:RELEASE.*`. Docker Hub's message is `pull access denied ... repository does not exist or may require 'docker login'` — it names NO TAG, because it is about the repository; a missing tag reads `manifest for ...:TAG not found` instead |
| Verifying a Docker Hub pull **in this sandbox** | **THE MIRROR WILL LIE TO YOU.** `/etc/docker/daemon.json` sets `registry-mirrors: [mirror.gcr.io]`, so a pull can be served from the mirror's CACHE of a repository that no longer exists upstream — which is exactly what happened above: a pinned `minio/minio` release tag pulled here and failed identically in CI, which has no mirror. A local pull is evidence about the MIRROR, never about Docker Hub. quay.io is unreachable here at all (egress), so anything hosted there can only be verified by CI |
| `quay.io` | Unreachable. `public.ecr.aws`, `ghcr.io`, `mirror.gcr.io` all work |
| **An S3-compatible store IN THIS SANDBOX** | **SOLVED 2026-09-16 — `adobe/s3mock`, and it is NOT MinIO.** MinIO is unreachable here (quay.io); the mirror no longer has a cached `minio/minio` either, and `ghcr.io/gaul/s3proxy` and `ghcr.io/seaweedfs/seaweedfs` both fail to pull. `docker run -d --name sih-s3mock -p 9000:9090 adobe/s3mock` answers presigned PUT and GET, so `apps/e2e`, `seed:demo` and every media path run here for the first time. **It verifies NO signatures and enforces NO bucket policy**, so `N-04` — an unsigned fetch must be REFUSED — cannot pass against it and does not. That one failure is the environment; N-04 is verifiable only against MinIO, in CI. `docker-compose.yml` still names quay.io, deliberately: this is a local substitute, not a change to what ships. Since 2026-09-16 the substitute is a COMMITTED, documented file — `docker-compose.s3mock.yml`, copied to `docker-compose.override.yml` (gitignored, so it can never reach CI) — which is what let `test:durability` run here for the first time |
| A compose override publishing a port the base file already publishes | **`ports:` MERGES, it does not replace.** A plain `ports: ["9000:9090"]` in an override left the base's `9000:9000` in place, so the container asked for 9000 twice and docker refused it: `Bind for 0.0.0.0:9000 failed: port is already allocated`. That reads exactly like a stuck allocator, and it survived removing every container AND a full `dockerd` restart while a direct Python `bind()` on 9000 succeeded — docker was right the whole time. Use `!override` on the sequence. **`!reset` is the wrong tag**: it clears the key and takes the list under it with it, which starts the container with no published ports at all and looks like a different bug |
| Backgrounding a long-lived process from a Bash tool call | `setsid … &` inside a compound command is reaped with it. Use the tool's own background mode. **And check for a SECOND instance before believing a result**: a stale API holding port 3000 answers while the new one dies with `EADDRINUSE` into a log nobody reads, which cost three wrong readings of a change that was already correct. `pgrep -f main.ts` and `ps -o lstart=` |
| DynamoDB Local with `-dbPath` on a named volume | **Needs `user: root`.** The image runs as uid 1000; Docker creates a named volume's mountpoint owned by root; the process cannot open its SQLite file: `SQLiteException: [14] unable to open database file`. It does NOT exit — it answers 400 to a bare `GET /`, so the compose health probe passes, and then hangs every real request forever. Cost an hour of a CI run and looked like a wedged container |
| Android emulator **in this sandbox** | Boots, then crashloops. No `/dev/kvm`, no `vmx`/`svm`, so pure TCG: `system_server` is killed by its own watchdog *inside* `systemReady()` — `Blocked in handler on main thread for 94s`, limit 60s — restarts, and hits the same wall forever. Happens on a bare emulator with nothing installed. `pm.dexopt.install=skip` does not help (dexopt was never the problem) and `debug.disable_watchdog` is accepted by `setprop` but not honoured; the timeout is a compile-time constant. An `arm64` image is refused outright on an x86_64 host |
| Android emulator on a GitHub runner | **Solved 2026-09-06, run 7: boots in 77s.** The cause of the six failures was DISK SPACE, not the runner image, the system image, the timeout or the options. The emulator wants ~7.4 GB for its userdata partition and checks *after* the SDK install, the Gradle build and the Docker images have taken theirs: `FATAL | Not enough space to create userdata partition. Available: 6278.66 MB, need 7372.80 MB`. It is not launched in the foreground, so that fatal exit surfaced only as a boot timeout with no device — the exact symptom of all six. The workflow frees ~7 GB first and `scripts/emulator-launch.sh` caps the partition at 2048M and captures the emulator's own output on every path. `KVM (version 12) is installed and usable`, reported by the emulator itself |

## Running the app on a device: what actually works

**The emulator belongs in CI, not in this sandbox** (see the table above). The
job is `.github/workflows/android-emulator.yml`, `workflow_dispatch` only
because the repository is private and each run costs ~20 minutes of the
account's Actions allowance.

Why CI and not here: one runner holds **both** the emulator and the API, so the
app reaches the server at `10.0.2.2` — the emulator's alias for the host
loopback. That removes the inbound-route problem entirely: no tunnel, no
allowlist entry, no public deployment. A *physical* phone gets none of this and
still needs a hosted API, which is why T045-on-hardware is gated on the hosting
decision rather than on tooling.

Two traps, both of which cost real runs:

- **`runs-on: ubuntu-22.04`**, per the table above.
- **A signed token is not an identity, and since 011 it is not the way in
  either.** The app signs in with an EMAIL ADDRESS AND A PASSWORD
  (`POST /v1/auth/sign-up`, `POST /v1/auth/sign-in`), and
  `apps/api/scripts/mint-device-token.ts` now provisions a credential beside the
  token so the device flows take the product path. The token is still printed
  and still needed, because the fixture seeders are HTTP clients acting AS that
  person rather than signing in. The original trap stands underneath all of it:
  a correctly signed JWT whose profile row does not exist gets `404 No such
  person` from `GET /v1/me`, so the row has to be written through the API's own
  `PersonRepository`.

**Six runs failed, and none of the six explanations was right. Run 7 booted in
77 seconds.** Three of the failures were mine, every one the same shape —
writing a step from memory instead of from the thing that already worked:
`curl -sf` where the tested probe was `curl -so` (DynamoDB Local answers a bare
`GET /` with 400, and `-f` turns that into failure), the heaviest system image
against a default 10-minute limit, and `-accel-check` before the SDK existed.

The other three got two confident explanations — an `emulator-options`
override, then the Ubuntu 24.04 AVD-path bug. Both were plausible, both matched
the symptom exactly, both were wrong, and **the second was written into this
file as established fact and had to be retracted**.

The actual cause, found the first time anyone captured the emulator's own
output, was that the runner did not have enough free disk for the userdata
partition. Nothing about the readiness probe, the system image, the acceleration
check, the emulator options or the runner image was ever the problem.

**The lesson is not "check your config".** It is that six runs were spent
iterating on a failure nobody could observe, and that the fix arrived in the
same execution as the first observation — a local run of
`scripts/emulator-launch.sh`, costing nothing. When the failure is invisible,
**make it visible before changing anything**, and prefer the free observation to
the expensive guess.

### A SOFT KEYBOARD CANNOT BE MEASURED IN A BROWSER (runs 38-42, 2026-09-08)

Four failed runs, about an hour of Actions time, and three of the four were
mine. The findings are worth more than the runs cost.

**A guard containing an invented constant tests the constant.**
`signin-fit.spec.ts` was written after run 39, verified RED against run 39's
exact numbers, and then passed through runs 40 and 41 while the device failed
identically each time. It opened the page at 320x390 - "what is left of a 640pt
screen once a keyboard takes 250" - and checked the submit button against 390.
**250 was invented.** react-native-web has no soft keyboard, so no browser
measurement can ever supply that number.

The fix is to stop needing it: **the submit button is ABOVE the field.** A
control above the field cannot be covered by a keyboard that opens below it, at
any keyboard height, under `adjustResize` and `adjustPan` alike. That is an
invariant, not another number to be wrong about.

**But the rule is NOT "never put a submit below a field."** The comment and
message composers do exactly that and passed runs 34 and 37, because each sits
under a `flex: 1` list that absorbs the resize, so the composer rides up with
the fold. Sign-in had no absorber - top-aligned content, fixed offsets - so the
keyboard simply covered what fell below. **A screen with nothing to absorb the
resize cannot put a control where a keyboard can reach it.**

**When it IS the flow and not the product.** Run 42's compose place picker
(y=642) and profile caption (y=659) were both past a 640pt fold, and both are
one swipe away on surfaces built to scroll - the artboards are drawn at 390x844.
Sign-in was different in kind: that screen does not scroll AT ALL, so the control
was unreachable rather than un-scrolled-to. The first two are flow fixes and the
third was a product fix, and confusing the two in either direction is how run 36
happened.

**A device-anchored bound beats an arithmetic one.** Where an invariant is not
available - a search results list is necessarily BELOW its field - bound the
guard by what a device demonstrably reached (`ngmeasure.spec.ts`: 289, from runs
34 and 37) rather than by 640 minus a guess.

**Evidence you cannot reach is the failure runs 1-6 were spent on, again.** The
whole-run API aggregate was printed FIRST in the evidence step, above a logcat
filter, a logcat tail, an emulator dump and eighty-five resource rows that never
move. Job logs come back only as a TAIL, and the artifact holding the same data
is on a blob host this environment's egress denies with a 403. Two tails, 380
lines, never reached it - which is why run 40 is recorded as **cause unknown**
rather than given a story. The aggregate and flow results print LAST now and go
to `$GITHUB_STEP_SUMMARY`; run 41 named its failing step in the first tail taken.

**And a claim of mine that the evidence did not support.** I wrote that a
113-point layout regression "would have cost run 42 or the one after". Run 42
drove the pre-fix layout and that flow PASSED. The measurement was real; the
near-miss was invented. Reaching for the more dramatic reading of your own
evidence is the habit these records exist to check.

**The app runs on Android and EVERY journey passes** - run 43, 2026-09-08,
**20/20** on 007's ranked feed and redesign (the suite gained
`22-cold-start`). Record:
`docs/verification/runs/2026-09-08-feature-007-record.md`.

Before it, run 37, `19/19` on 006, every flow on its first attempt. Record:
`docs/verification/runs/2026-09-08-feature-006-record.md`.

Earlier milestones, kept because each records something the next one assumes:
run 34 (`19/19`, 005), run 29 (`17/17`, 004) -
`docs/verification/runs/2026-09-07-android-device-pass-17-of-17.md` - and see
"What the Android runs added" below for the four findings that got there.

The ten-journey run below is the earlier milestone. Run 25, 2026-09-06:
`10/10 Flows Passed in 8m 4s`. Each journey's effect is asserted through the
SERVICE, not the view hierarchy - `POST /v1/posts` 201, comments 201, reports
201, follow 204, and the published caption read back from
`GET /v1/people/{handle}/posts`. Record:
`docs/verification/runs/2026-09-06-journey-run-android-PASS.md`.

**Seven product defects were found by running it, and only by running it.**
Every one was invisible to a green test suite:

1. **Install Expo native modules with `expo install`, never `pnpm add`.** The
   latter took `expo-image-picker@57` against SDK 54's `expo-modules-core@3`;
   `NoClassDefFoundError: AnyTypeCache` killed the app during module
   registration. `expo install` cannot reach its API from this sandbox - read
   `node_modules/.../expo/bundledNativeModules.json`, which is authoritative.
2. **`usesCleartextTraffic`** must be set via `expo-build-properties`; the
   `android.usesCleartextTraffic` app-config field is accepted silently and does
   nothing. Without it every request to `http://10.0.2.2:3000` is refused by the
   platform before reaching the network.
3. **Presigned URLs need a PUBLIC endpoint.** The API signed against its own
   `127.0.0.1:9000`, which inside the emulator is the DEVICE's loopback.
   `S3_PUBLIC_ENDPOINT` signs for the client's address; a signature covers the
   host, so the URL cannot be rewritten afterwards. The runner also needs
   `ip addr add 10.0.2.2/32 dev lo` so the host-side fixture resolves the same
   name (an /etc/hosts entry cannot work - resolvers short-circuit IP literals).
4. **Never read a `data:` URI with `fetch(...).blob()` in React Native.**
   Browsers resolve it, RN does not. The upload never completed, so the publish
   button stayed disabled and tapping it was a silent no-op.
5. `sampleMedia.ts` declared `sizeBytes: 68` for 70 bytes.
6. The self profile tab passed the literal `"me"` as a handle, so
   `GET /v1/people/me/posts` 404'd and your own posts never loaded on your own
   profile.
7. `PostQueryService.listByAuthor` returned VisibilityFilter's CANDIDATE rows as
   the response - `caption: null`, no media, no counts, no author. The **fifth**
   instance of that defect here; the filter decides what is visible, never the
   shape of what to send.

**Not verified AS OF RUN 25** - J-05 has since been covered: `19-publish-video`
uploads a real clip and asserts the poster frame on a device (run 29). J-10 (a
block hides content from later flows in the same suite; covered over HTTP by
N-03) is still recorded `not run`. An image chosen from a POPULATED gallery is not covered - flow 10
verifies the hand-off to `com.android.documentsui` and deliberately does not
drive Google's own UI. FR-012's refusal path is not producible on API 30, where
the picker needs no storage permission.

## What spec 003 established (2026-09-06)

**Still unverified, and must be reported that way:**

- **Android journeys.** The runtime boots; the app has never rendered a frame on it.
  T013/T015/T043 need an emulator run, which spends the account's Actions allowance on a
  private repository — the owner's call, never an implicit part of a task.
- **iOS.** Nothing has ever run. The Simulator is macOS-only and macOS runner minutes bill at
  ten times the rate. Unverified, not "probably fine".
- **Real usage.** Nobody has used the product. Retention, second-post rate and onboarding
  success stay unanswered; a script exercising those paths measures the script.
- **A public deployment.** Durability is delivered; a public address is not. DynamoDB Local is
  still a dev tool, and the datastore decision (`003/datastore-decision.md`) is the owner's and
  is recorded as pending.

**Established:**

- The emulator's six failures were disk space, found by capturing its output once (above).
- The durable stack keeps what it is given across a full restart, and the event bus replays
  work a crash interrupted — a defect the durability test itself found, because the replay ran
  from `onModuleInit` and Nest fires that *before* subscribers register, so the record was
  cleared with nothing having handled it.
- `LOCAL_JWT_SECRET` has no default. The old one was a constant in this repository.
- **Following a person now works** (003/T053). It did not: `ProfileContainer` loaded only your
  own profile whatever handle it was given, hardcoded `viewerIsFollowing: false`, and its
  follow button was `() => undefined` — so the app could not demonstrate the premise of its
  own non-negotiable Principle I. Nothing caught it because every test rendered `ProfileScreen`
  directly with props, which proves the screen works and says nothing about whether anything
  calls it. **A screen test is not a container test.**

## The Actions allowance is BLOCKED AGAIN, and CI has not run since 2026-09-16 05:07

**CHECKED, NOT ASSUMED, 2026-09-16.** `visibility: private` (this is the fork). CI runs
**69 through 73** — every push of 012 and 013 — are all `conclusion: failure`, each
completing about **four seconds** after it started with **no steps at all**. The job's
check-run annotation says why, verbatim:

```
The job was not started because recent account payments have failed or your
spending limit needs to be increased. Please check the 'Billing & plans'
section in your settings
```

Read from the API rather than inferred, because this file already records two confident
explanations for unobserved CI failures that had to be retracted:

```
curl -s https://api.github.com/repos/<owner>/<repo>/check-runs/<job_id>/annotations
```

(the job id comes from `list_workflow_jobs`; the job's LOGS 404, because a job that never
started produced none — which is why the annotation is the thing to read).

**WHAT THAT MEANS FOR EVERY "gates green" LINE IN THOSE FIVE COMMITS.** They are LOCAL
results. Nothing in 012 or 013 has been through CI, so the frozen lockfile, the ffmpeg
install, the MinIO pull from quay.io, `playwright install`, `test:durability` and the
Postgres wait have all been unverified on a runner since 2026-09-16 05:07. In particular
`quay.io/minio` has never been proven to pull from a runner since MinIO left Docker Hub —
this sandbox cannot reach quay.io at all, so **CI is the only instrument for it and CI has
not run**.

**Only the owner can clear this** — it is the billing on their account.

The 2026-09-06 occurrence, for the pattern: every workflow failed ~6 seconds in with the
same message, blocking ordinary CI as well as the emulator job.

**THIS PARAGRAPH HAS BEEN TRUE AND THEN FALSE THREE TIMES. CHECK THE API, NEVER THIS FILE.**

```
curl -s https://api.github.com/repos/<owner>/<repo> | grep '"visibility"'
```

The history, because the pattern matters more than any one reading: public on 2026-09-07
(free runners), then a private fork was taken and `visibility: private` applied to IT on
2026-09-12 (2,000 shared minutes, jobs STOP rather than bill at a $0 spending limit), and the
claim was repeated from this file both times instead of checked. It takes one request.
**Checked again 2026-09-16: still `private`** — so the "now that it is public" sentence in
`ci.yml`'s masking comment is stale too, though what it guards is right either way.

**Which repository you are in decides the answer, and they differ.** `socialInterest` is the
public upstream: runners are free, and general product work belongs here.
`SocialLetInterest` is the private fork carrying its own UI and backend features through the
overlay seams; its Actions draw on an account-wide 2,000-minute allowance shared with every
other private repository the owner has, which is why the heavy jobs live upstream.

**WHERE THIS REPOSITORY IS PUBLIC, ACTIONS LOGS AND JOB SUMMARIES ARE WORLD-READABLE.**
009's session descriptor printed a live credential into its job summary. It died with the
session (30 minutes, against a random tunnel address) but anyone reading the Actions tab in
that window had it.

**CLOSED 2026-09-16.** The descriptor publishes no credential. `scripts/session-up.sh` still
MINTS one — steps 7 and 7b act AS that person over HTTP and cannot sign in to do it — and it
never leaves the runner. A person types the backend address and creates an account, which is
what 011 made possible.

**The requirement that kept it there is the part worth remembering.** 009/FR-014 said a
session MUST issue a credential, and justified itself in one sentence: *"The product has no
self-service sign-up."* 011 made that false and the requirement stayed — along with a MUST in
`contracts/session-descriptor.md` §2, a row in its "what a descriptor MUST contain" table,
US3's own title, an acceptance scenario and the quickstart. **Deleting the `printf` alone
would have left five documents demanding it back.** That is "grep the COPY, not only the
code" applied to a contract rather than to a follow hint, and it is why this sat open for two
features: each time, the code looked like the whole job.

Not swapped for the email and password `mint-device-token.ts` provisions beside the token —
that is the same exposure with more steps. And the repository being private today is not the
reason this is safe: this file records reading visibility off a stale paragraph three times.

The paragraph as written on 2026-09-07: The repository is **public** (`visibility: public`, checked 2026-09-07),
so GitHub-hosted standard runners are free on it, and CI runs 169-176 plus emulator runs
26-29 all executed normally. The cost rule in `plan.md` is a rule about SPEND, and a run
on this repository does not spend - so dispatching the emulator job is not the owner's
call any more. Check the facts before repeating either claim; both halves of this one
expired within a day.

## What spec 012 built (2026-09-16) — the app says what it is doing

`specs/012-ui-states-and-flows/`. The owner installed the app and said the
interface was bad and the flows incomplete. **Every task is closed except T031,
which needs their install and a device.** Record:
`docs/verification/runs/2026-09-16-012-record.md`.

### THE SANDBOX CAN RUN `apps/e2e` NOW, AND THAT IS THE BIGGEST CHANGE HERE

Object storage is reachable: **`adobe/s3mock` from Docker Hub**, which is NOT
MinIO (quay.io is still blocked). With it plus `scripts/ffmpeg-shim`, the
end-to-end suite and `seed:demo` both run here for the first time.

**PRINCIPLE V, LITERALLY.** S3Mock verifies no signatures and has no bucket
policy, so **`N-04` — "does not serve media to a viewer who may not see it",
which fetches a key with NO signature and expects a refusal — cannot pass
against it and does not.** That failure is the environment. N-04 is still
verifiable only against MinIO, in CI, and must be reported unverified.

To run anything here: `.env.local` with the local values, the ffmpeg shim on
`PATH`, and `cp docker-compose.s3mock.yml docker-compose.override.yml` before
`docker compose up -d`. (A hand-run `docker run -d --name sih-s3mock -p
9000:9090 adobe/s3mock` works too and is what 012 used, but it leaves object
storage OUTSIDE the compose project — so `test:durability`, which shells out to
a bare `docker compose down && up`, cannot cycle it.)

**`pnpm --filter @sih/e2e test:durability` HAS NOW RUN HERE, and it had been
broken by 010.** It read the outstanding-event partition with the AWS SDK
against DynamoDB Local while the product writes it to Postgres. Repaired, it
reports **3 of 4 in one run and 4 of 4 across runs**, and the one that moves is
the environment rather than the product: S3Mock keeps nothing across a container
restart (no volume, and `initialBuckets` does not re-run), so by the third case
the bucket is a 404 and the upload fails. Run `s3:create-local` and that case
passes — including `toHaveLength(1)` on the pending event, which is the exact
assertion the broken read made unreachable. All four in ONE run needs MinIO.

**A POOL THAT OUTLIVES A DELIBERATE DATABASE RESTART NEEDS AN `error` LISTENER.**
The first run failed all four cases with a page of pg client internals and
nothing naming the restart they had just performed on purpose: `compose down`
sends every idle connection `terminating connection due to administrator
command`, `pg-pool` re-emits it on the Pool, and a Pool with no listener makes
that an UNHANDLED error event. Both module-scoped pools in the harness have one
now.

**Two API processes will lie to you.** A stale one holding port 3000 answers
while a new one fails to bind with `EADDRINUSE` into a log nobody reads — which
cost three wrong readings of a change that was already correct. `pgrep -f
main.ts` and check `ps -o lstart=` before believing a result.

### 013 left `apps/e2e` unrunnable and nothing could see it

`reset.ts` records that `seed:catalogue`'s callers "were hunted rather than left
to fail", and they were — nothing calls it. What was missed is the SECOND-ORDER
dependency: **ninety-eight places opening `listTop({limit:1}).items[0]!`**,
which depended not on the seeder but on what the seeder left behind. Forty-six
tests failed. A grep for the removed thing cannot find those; only running the
suite can, and this environment could not. **It would have been a red CI build.**
`apps/e2e/support/interests.ts` creates one the way a person does, once per run.

### Three live defects, all found by running rather than reading

1. **`POST /v1/posts` RETURNED THE PERSISTENCE ROW.** `authorId`, `interestIds`
   and `updatedAt` went out; `author`, `interests` and `media` did not, and the
   contract requires two of those. **Seventh instance of this shape** — and the
   comment forty lines below it, "Not `{ ...result.post }`: that is the
   persistence row", was written about the DETAIL route while this one did
   exactly that. The app reads only `postId` from a publish, so five features
   went by.
2. **AN UPDATE THAT MOVED A ROW BETWEEN INDEXES DID NOT MOVE IT.** `runUpdate`
   wrote `update items set item = <jsonb>` and never the key COLUMNS, which
   every query reads. On DynamoDB there was no distinction. Two silent journeys:
   accepting a conversation left it out of the accepted inbox, leaving a group
   left it in. **Neither was a product bug — both writes were right.** Guarded
   by a QUERY, not a read, because a read passes throughout.
3. **`postCount` HAD NO WRITER AND THE COUNTS CAME FROM A CACHE NOTHING
   REFRESHED.** `incrementPostCount` had no caller anywhere (013 recorded that
   and routed around it), and `detail`/the listing read
   `InMemoryCatalogueCache`, which reloads only on create/merge/retire/describe
   — so **`followerCount` had been stale since it was written** and
   `suggested()` was sorting by it. The counter is written in the publish and
   delete transactions now, beside the rows it counts; the values come from the
   row.

### What the feature added

- **`Photo`** — the four-state rule applied to a photograph (R3: "six cards,
  six empty grey boxes, on a product whose entire premise is photographs").
  Placeholder OVER the image, not instead of it, because swapping remounts and
  restarts the fetch; a retry bumps a key so React Native actually re-requests.
- **Explore is tiles**: one field, a 2x2 mosaic, the name in the interest's
  colour, the post count, busiest first. **Surface 17** — post media reaching a
  viewer is a post read path whatever size it is drawn at — with a matrix row
  and a probe, and `previewForInterests` calls `listByInterest` so the boundary
  makes the decision it already makes. **The matrix is 1,586 assertions across
  17 surfaces.**
- **Action sheets** for a post and a person. A profile had Follow and Message
  and nothing else, so **the only way to block somebody was to find one of their
  posts and press a button labelled Report.**
- **A way back from every pushed screen**, enumerated over all nineteen routes.
- **The cold start per its artboard**, and the case 013 created: a catalogue
  with nothing in it is not a question worth asking, so it records "none" and
  goes through.

### Decisions recorded rather than guessed

- **A new account gets NOTHING** (T044). Not content — borrowing `seed:demo`
  answers a product question with a script. What changed is the OFFER: "Explore
  interests" opened a second empty room on a fresh install, failing both halves
  of FR-020 and FR-021 on exactly the install they are about.
- **"Report account" is on the artboard and is NOT built** (T034).
  `ReportSubjectType` has no `person`, and adding one files a report an operator
  cannot act on — a person's status is `active | deleting | deleted`, there is no
  suspension, and no moderation action takes a person. **A real gap, needing an
  operator action before it is a control.**
- **"Busiest interests", not "Busy this week"**. There is no seven-day window
  and nothing computes one; 008/T224 is the precedent for not shipping a
  sentence the product cannot back.

### Guards that refused this work, correctly

The touch-target guard on an unmeasured `hitSlop` and an unsized tile;
`no-hardcoded-style` on a scrim literal (now a palette token, heavier in the
dark palette where 38% over a dark page is not a dim at all); React Native on a
`numColumns` change to one `FlatList` instance (007's second-render lesson);
and `verify-maestro-ids` on `sheet-${action.key}` with the message 005 got three
times — the row keys are a closed union declared where the verifier reads them.

**A PREFIX IS NOT A NAME, third occurrence.** `search-result-0` is a TILE before
typing and a list row after, both preserved deliberately — so it is ambiguous
for the instant between the keystroke and the re-render, and a click can land on
a different interest. Passed alone, failed once in a full run, exactly as
`share-person-.*` did.

**And one file-level allowance that hid a control.** `InterestScreen.tsx` is in
the touch-target guard's `ALLOWED` list as a whole-row-target file, so a
`hitSlop` added there is measured by nothing. That allowance was argued for post
rows; borrowing it for a text link is the per-file weakness 007 took out of the
sized branch and 011 took out of the slop branch, arriving by a third route. The
control is sized instead.

### Still not verified for 012, and must be reported that way

- **NOTHING IN 012 HAS RUN ON A DEVICE.** T031's browser half is answered — a
  real photograph, a real presigned url, 200/image/jpeg/non-zero bytes — and the
  device half is not: react-native-web renders an `Image` as a div with a CSS
  background where React Native uses its own loader, which is the difference
  that hid 006's `Avatar` overflow. **`naturalWidth` cannot be used to measure
  this in a browser, and the first version of that test used it anyway.**
- **`N-04`**, above.
- **One API run in ten reported a single extra failure** (`SC-004 returns ONLY
  followed authors`) that passed alone and on the next full run. Recorded as
  unreproduced with no cause.

## What spec 013 built (2026-09-16) — the interests belong to the people using them

`specs/013-user-owned-interests/`. The curated twelve are **deleted**. Interests are
**flat and hashtag-like**: a person publishing names the subject freely, the name is
resolved-or-created **inside the post's transaction**, and `POST /v1/interests` is gone
because it produced an interest with no posts. Record:
`docs/verification/runs/2026-09-16-013-local-record.md`.

**Principle I is NOT amended and did not need to be.** It requires every post to be
filed under an interest and interests to stay first-class surfaces; it is **silent on
who creates them**. Every post still carries one. 001/FR-024's sub-interest roll-up is
**withdrawn** by the flat model, and every place describing it was updated rather than
left describing a product that does not exist.

### HANDLES, AGAIN: the constraint did not exist

`createSubInterest` guarded `attribute_not_exists(pk)` where `pk` carries a **fresh
ULID**, so the condition could never fire for a NAME — and what stood in for it was a
read against a **per-process** cache. 011's handle defect word for word. Measured rather
than reasoned about: **8 of 8 simultaneous claims on one name succeeded; 1 after the
claim row.** A read-then-write produces an occasional 2; this produced a reliable 8,
because there was no race to lose. Both halves of the measurement are the evidence.

### No threshold separates a synonym from an unrelated word — measured

Real synonyms score **0.13–0.23** on this repo's own similarity function (NYC / New York
City, Football / Soccer) while unrelated pairs score **0.75–0.83** (Golf / Wolf, Baking /
Biking) and typos **0.86–0.91**. The bands **overlap the wrong way round**, so edit
distance cannot tell a synonym from a coincidence and **automatic merging is impossible
by measurement, not by caution**. A merge moves posts and followers and is irreversible
here, so it stays an operator action.

### Defects no plan predicted, and what each one teaches

- **`loadAll()` walked the hierarchy** through the index this feature deletes, so the
  cache loaded **empty** and the duplicate gate accepted everything — the feature's own
  failure mode arriving through the loader. **The unit guard stubs `loadAll` and was
  structurally blind to it**: 007's `ApiPage` defect in miniature, a stub agreeing with
  the test and not with the datastore.
- **`smoke:boot` was still calling `catalogue.childrenOf('ROOT')`**, deleted with the
  hierarchy. 2,050 API tests, a clean typecheck and a clean lint all passed over it — the
  call sits behind an `app.get<{...}>()` cast, which satisfies the compiler, and no suite
  runs that script. **Only booting the app found it.** Same shape as 007's device runner
  invoking a deleted fixture, for a command instead of a 25-minute run.
- **`postCount` is never maintained** — `incrementPostCount` has no caller anywhere — so
  retiring an interest on `postCount === 0` would have retired nothing and **looked
  implemented**. Housekeeping reads index ROWS.
- **The 409 stopped carrying its candidates** when the gesture moved to the publish
  route. A bare refusal is the whole sprawl control doing nothing: FR-009/FR-010 exist so
  a client can offer "join this one instead".

### THE CONTRACT HAD STOPPED DESCRIBING THE PRODUCT, IN FIVE PLACES

Removing `POST /interests` from the document took the generated client from **93
operations to 92**, and the 92 found the rest. Every one is 002's first defect — the
contract and the API disagreeing, each looking right alone:

1. **`PostCreate` declared neither `interestNames` nor `acknowledgedSimilarTo`, and
   REQUIRED `interestIds`.** 013's entire premise was absent: a client generated from the
   contract could not name an interest at all. It works from the app only because
   `apps/mobile/src/data/posts.ts` declares the field **by hand**.
2. **`POST /posts` did not declare the 409** the near-duplicate refusal now returns.
3. **`GET /interests/similar` declared `parentId` as REQUIRED** while the server had
   stopped reading it — the controller's own comment says demanding one "would have made
   this endpoint unreachable from a compose screen that has none", and the contract was
   demanding it the whole time.
4. **`GET /interests` declared `level` and `parentId`**, accepted and ignored end to end.
   **An accepted-and-ignored filter is one a caller cannot tell from a filter that
   matched everything** — removed from the signature, not left unread.
5. **`InterestCreate` and `InterestDetail.subInterests`** described a route and a
   hierarchy that no longer exist.

### Three dead halves, all of them the pattern this repository keeps recording

- **`InterestContainer` still CALLED `data.interests.listChildren(interestId)`** on every
  interest screen open and threw the result away, under a comment saying interests are
  flat: a request per open, carrying a `parentId` the server ignores, for a list nothing
  renders. **Deleting the METHOD is what turns a dead call into a typecheck failure
  rather than a comment.**
- **`createInterestSchema` survived its route's removal** as an unreferenced const, still
  making `parentId` mandatory — the single field 013 exists to remove.
- **Two doc comments still described the curated tier** after the code stopped making
  that distinction. When a requirement is withdrawn, **grep the COPY, not only the code**.

### Decisions taken against the plan, on evidence

- **The merged name's claim is NOT released.** The plan said to release it so the name
  was not permanently burnt. Writing the test showed that is worse: resolve already lands
  a person on the survivor, and releasing the claim would let the next person **recreate
  the duplicate the merge removed**.
- **An interest whose posts are all HIDDEN is not retired** (T037). `retireIfEmpty` reads
  index rows RAW, deliberately: asking the boundary "does any post exist" would make a
  housekeeping job a second visibility decision, which Principle II forbids.
- **T021's candidates are shown.** Compose reads the 409's `candidates` and offers
  one-tap joining; a keystroke invalidates a refusal about the previous name.

### The gates that had to hold, and did

**The visibility matrix is unmoved: 1,488 assertions across 16 surfaces** (1,470 post
across 15 post surfaces, plus 18 review). The public route snapshot moved by exactly one
route — `POST /interests` — which FR-025 calls for as a deliberate, reviewed edit and
research R5 named before the work started.

### Still not verified for 013, and must be reported that way

- **NOTHING IN 013 HAS RUN ON A DEVICE, and no browser journey has run either.**
  `apps/e2e` needs a server and a browser this sandbox does not have, and MinIO is
  unreachable here (quay.io, egress), so every rewritten journey is **written and
  unexercised**. A clean typecheck confirms the call sites compile, which is a different
  claim.
- **`ports.contract` and `us1-exif` fail on MinIO** and are baselined by stashing the
  change and watching them fail identically. API suite: **2,050 passed, 2 failed**.
- **One API run reported three failures and the third suite was not captured**; two runs
  immediately after were 2/2,050 identically. Recorded as **unreproduced with no cause** —
  this file already records two confident explanations for unobserved failures that had
  to be retracted.

## What spec 011 built (2026-09-14) — the app opens like an app

`specs/011-email-password-identity/`. Until this, the only way into the product was
pasting a 244-character JWT a developer had minted. Every other capability was built and
verified on a physical device; the first screen asked the person to do the one thing they
could not do. **Phases 1–5 are implemented (sign-up, sign-in, the session). US4, password
reset, is NOT — it needs a mail provider nobody has opened an account with.**

### THE RESEARCH PHASE FOUND A LIVE DEFECT, AND IT WAS NOT SUBTLE

**Handles were not unique**, and `findByHandle` returned the *second* holder — so a
profile, a mention, a conversation, a follow, a block and a report would each have silently
addressed the wrong person, across thirteen call sites in six services.
`PersonRepository.create` guarded on `attribute_not_exists(pk)` where `pk` is
`USER#<userId>`, a fresh identifier per call, so **the condition could never fire for a
handle**. Measured rather than reasoned about: *eight of eight* simultaneous claims on one
handle succeeded, every time.

That distinction earned its place. A read-then-write would produce an occasional 2; this
produced a reliable 8 — **there was no race to lose, because there was no constraint** — and
a fix aimed at narrowing a window would have looked like progress against the wrong
diagnosis. It had never bitten because no human had ever chosen a handle, and US1 is
precisely the change that removes the thing hiding it.

The claim is enforced in `PersonRepository.create`, not in sign-up: `create` is the one path
every person comes through, so uniqueness there cannot be forgotten by a caller. In
`auth.service` it would have defended the one door a human uses and left four open.

**And the analysis pass caught that the fix reintroduced the defect.** A claim record
defends only rows that carry one, and the 6,375 existing handles carried none — so the first
human ever to choose a handle could have taken one already in use. They are back-filled now,
**measured first** (0 collisions, so the generated-suffix argument finally has a measurement
behind it) and refusing to write at all if that count is not zero: which account keeps a
contested name is a person's decision, not a script's.

### The timing leak is 45.7x, and the message assertions pass straight through it

`contracts/identity.md` §4 predicted it and the measurement confirmed it. Against the
natural implementation — look up, return early when the address has no account — an unknown
address answers in **8ms** where a wrong password takes **~370ms**, because the absent case
skips the key derivation.

**Same 401, same body byte for byte, both populations, with the leak wide open.** A test
asserting only the message signs this off. Sign-in now derives against a fixed dummy hash
when it finds nothing, and the refusal is built *after* the verification so no branch can
return without having paid.

Two things about how it is measured, both of which are the general lesson: it compares
**medians of repeated samples**, because a single pair is two numbers from a machine running
fifty other suites; and the threshold is a **ratio, not a millisecond bound**, because an
absolute one encodes this machine's speed — the invented-constant failure that cost four
device runs. The second assertion (both medians above 20ms) exists because **the ratio alone
is satisfied by being equally fast**: delete the derivation and both answer in a
millisecond, the ratio is ~1, and a ratio-only test passes over a product that never checks
passwords.

### Guards that passed things they should not have — three, in one feature

- **My constant-time guard passed a deliberate break.** It asserted the FILE contained
  `timingSafeEqual` and that no `===` appeared in three hand-guessed spellings. Replacing
  the comparison with `derived.toString('base64') === hash.toString('base64')` left the
  import untouched, so the file still contained it and none of the guesses matched: six
  assertions green over a short-circuiting comparison. It reads the `verifyPassword` BODY
  now and asks two questions with no list in them.
- **The concurrency test would have passed for the wrong reason.** Six simultaneous sign-ups
  against a route whose capacity is five: one 201, assertion satisfied, and the other five
  refused **429 by the rate limiter** without ever reaching the uniqueness constraint.
  Delete the conditional write and it still passed. It sizes each batch at the capacity now,
  clears the limiter, and asserts no response was a 429.
- **The touch-target guard's `hitSlop` branch matched per FILE.** 007 removed exactly that
  weakness from the sized-control branch — "one sized control approved every other one in
  the same file" — and left it in the other one. A second slop control added to
  `SignInScreen.tsx` rode in free on the first one's arithmetic. Keyed per control now.

### Two fixtures that were quietly wrong

- **The shared `AppData` fake had a trailing `...over`** *after* every per-key merge, so a
  caller passing `session: { isSignedIn }` got a session with `isSignedIn` and nothing else
  — every `...(over.session as object)` above it was dead code that looked like a feature.
  Harmless only because callers happened to supply everything the shell touched. Adding
  `session.resume()` killed five suites with a default that was right in a fixture that
  discarded it.
- **The testID snapshot was NINETEEN IDS BEHIND.** Because an addition never fails, nothing
  ever forces an update, so it drifts — and **the guard can only detect the removal of an id
  it knows about**. For 008's privacy, appeals, collections and follow-request ids, and
  009's address controls, it was protecting nothing. The permissiveness is still right;
  what is worth knowing is that the protection DECAYS between removals.

### Established

- **`isSignedIn` is not the question.** It answers "is there a token in the store", which a
  credential that has expired, been revoked, or belongs to another backend satisfies
  perfectly — and then every screen 401s into an empty product. `session.resume()` asks
  whether it WORKS, clears a rejected one, and **rethrows a network failure**: treating an
  unreachable backend as a bad credential signs somebody out of a working account because
  their train went into a tunnel, and throws the credential away doing it.
- **The submit-above-the-fields invariant absorbed a third field.** Sign-in went from one
  field to three and the submit did not move. The arithmetic guard it replaced would have
  needed re-tuning — to a number that was invented in the first place.
- **FR-023's first version forbade US4's own routes.** "Sign-up and sign-in are the only
  routes this feature makes public", with SC-007 pinning "exactly two" — but somebody who
  has forgotten their password holds no credential, so the two reset routes are reachable by
  them or by nobody. Phase 6 also had no controller task at all: the row, the identical
  response and the single-use condition were specified with nothing to call them.
- **The credential epoch has no value for an account with no credential row**, which is
  every account that exists today. Fail closed and every emulator journey and the laptop
  runbook sign out in one commit; fail open and nothing said so. **An absent epoch verifies,
  on either side**, and the direction differs from privacy's fail-closed on purpose: an
  account with no password has nothing a reset could revoke.
- **Identity went in the BASE position, not the overlay seam**, and the plan says why:
  identity is the floor under the whole product, not a fork's own feature, so putting it in
  the overlay would make the app's front door a permanent private divergence and guarantee
  upstream builds a second one. The sync conflict is bought deliberately.

### THE CREDENTIAL EPOCH IS WRITTEN AND NEVER READ (found 2026-09-16)

`issueForPerson` signs an `epoch` into every credential, `credential.repository.ts` stores
one, and `LocalIdentityProvider.verify` reads `sub` and `operator` **and nothing else**. Two
halves out of three — and `identity-provider.port.ts` **claimed in a doc comment that it was
compared on verify**, which is the eighth instance here of a comment describing a product
that does not exist.

**Dormant, not broken, and the distinction is the whole judgement.** Nothing advances an
epoch, because the only thing that would is US4's password reset — which is not built, needs
a mail provider nobody has an account with, and whose absence FR-022 makes a stated condition
rather than a gap. A claim nobody has had a reason to check is not yet a defect.

**It becomes one the instant a reset lands**, and silently: the reset would appear to work
and every credential issued before it would keep working. 011/T042 is the task that adds the
comparison, T048 the one that proves a pre-reset credential stops working, and T044 the
reminder that comparing costs a datastore read on the hottest path in the product. The
comment is corrected in place rather than deleted, so the next person to read the port finds
the state of it rather than the intention.

### Still not verified for 011, and must be reported that way

- **NOTHING IN 011 HAS RUN ON A DEVICE.** No emulator in this sandbox, so
  `35-sign-up-and-out.yaml`, the rewritten sign-in flows and
  `mint-device-token.ts`'s credential path are **written and unexercised**.
  `verify-maestro-ids` confirms every selector resolves, which is a different claim.
- **No browser journey has run either** — `apps/e2e`'s updated specs need a server and a
  browser this environment does not have.
- **US4 (password reset) is not built.** A forgotten password is unrecoverable, and FR-022
  makes that a stated condition rather than a broken control: there is no "forgot your
  password" link, deliberately.
- ~~**009's session descriptor still prints a live credential** into a world-readable job
  summary.~~ **Closed 2026-09-16**, by withdrawing 009/FR-014 as well as by editing the
  script. See the note above.
- MinIO cannot run in this sandbox (quay.io is unreachable), so 3 API failures are that and
  1 is the grown-table appeal test; all four were baselined by stashing the change.

## What spec 008 Phases A and B built (2026-09-09)

`specs/008-post-reach-and-depth/` is **a complete-app scope**: 15 stories, 54 FRs, 17 SCs,
in five release phases. **All five phases are implemented, every local gate is green, and
008 RUNS ON ANDROID — run 59, 2026-09-09, every journey and every post-journey server
check.** Record: `docs/verification/runs/2026-09-09-008-device-record.md`. What that run
does NOT close is at the end of this section, and it is shorter than it was but not empty.

### THE PATTERN PHASE A EXISTS TO END: a declared half with no other half

Three cases, found independently by reading the build rather than by listing features:

| The product declares | What was missing | Consequence |
|---|---|---|
| Publish: "**Up to 10 photos**" | every render path read `media[0]` | 9 of 10 photographs invisible **to everyone including the author, permanently** |
| Notification `readAt`, returned to every client | **nothing wrote it** | every notification unread forever |
| A "**Following**" tab on the primary surface | no feed behind it | a control that did nothing for a whole feature |

A fourth and fifth were found while planning: `avatarKey` has no writer, and `avatarUrl` is
emitted on **one of seven** profile projections — as the **raw storage key**, which a private
bucket answers 403 to (006/R4b's defect in a second place). Both are Phase B.

**The guard that caught this class is one assertion.** `apps/e2e/journeys/response-shape.spec.ts`
now asserts every declared optional field is non-null in at least one fixture, and it was
**red on its first run against the shipped product** — `{ field: 'Notification.readAt',
populated: false }` — with nothing broken on purpose. `avatarUrl` sits in the same table with
`hasWriter: false`, **reported rather than asserted**, the same ratchet `surfaces.ts` uses:
asserting a field before its feature exists turns the suite red for every unrelated task,
which is how a signal stops being read.

**What that guard cannot catch, and it matters:** a field the server populates and a CLIENT
ignores. That is 007's `ApiPage<T>` defect, and it is also `media[0]` — the API returned all
ten the whole time. Only a request finds the first; only a rendering test finds the second.

### Established

- **THE SERVER WAS NEVER THE MEDIA DEFECT.** `PostQueryService.toResponse` already mapped
  every media row, presigned, and `keys.mediaItem`'s zero-padded `MEDIA#000` already carried
  publication order. `media-set.spec.ts` passed on its FIRST run. Four client call sites were
  the whole loss. **Every post fixture in the mobile suite had exactly one media item**, which
  is why 190 green tests said nothing — a multi-item assertion against a single-item fixture
  passes and means nothing.
- **A read watermark, not per-row writes** (008/R2). `readAt` is DERIVED from one
  `USER#<id>/#NOTIFREAD` item, which is the shape `ConversationRepository.markRead` already
  uses for messages. Writing on GET would mutate N rows on a hot path and give a GET side
  effects. The conversation row's stored `unreadCount` is deliberately **not** copied: a count
  and the rows it counts are two sources of truth for one fact.
- **The watermark comparison is INCLUSIVE.** A strict `<` leaves a notification created in the
  same millisecond as the mark permanently unread, so the badge shows 1 forever and nothing
  the person does clears it.
- **FR-009 needed enforcing in three places, not one.** Following must record no ranking
  signal: structurally on the server (the service cannot import the ranker), behaviourally on
  the server (the signal profile is byte-identical after paging), **and on the client** — dwell
  is measured on the device and posted separately, so leaving the hook wired would train the
  ranked feed from the surface a person chose to avoid it. No server guard can see that.
- **`MAX_FOLLOWED_PEOPLE = 200`** — a product constraint arriving from a technical bound. The
  Following fan-out is one query per followed author; without a cap the surface has no stated
  worst case. Named in the spec's Assumptions, because a limit a reader cannot find in the
  spec is a limit they meet as a bug.
- **The visibility matrix is 564 assertions, zero skipped** (was 480 before 008; 522 after
  Phase A). 546 post assertions across **13 post surfaces** — the Following feed and post
  search are the twelfth and thirteenth — plus 18 review assertions. Raising the pinned totals
  in `matrix.spec.ts` is a deliberate edit and is meant to be; `surface-routing.spec.ts`
  refused to pass until each new feed had a probe proving it **consults** the boundary.

### Two corrections I made to my own work, both worth keeping

- **I gave `MediaPager` a `viewerIsAuthor` prop** to hide failed items from non-authors. It
  was redundant **and wrong in kind**: `ProcessingService.reconcile` marks the whole POST
  `failed` if any item is, and `VisibilityFilter` shows a non-ready post only to its author —
  so anyone holding such a post IS the author. The prop was a second visibility predicate
  agreeing with the boundary today and one refactor from disagreeing. **Deleted.**
- **The analysis pass found two defects of the same class I had just written a plan about.**
  A caption edit did not rewrite the post-search term rows (captions ARE editable), and the
  term row projected no `visibility` while `postInterestIndex` denormalises it precisely so
  the filter can run on Query results — whose update fan-out carries a comment saying a
  drifted index item "is exactly the SC-009 failure this class exists to make impossible".
  Both are fixed in the design and are Phase B's to implement.

### Guards that refused my work, correctly

- **`verify-maestro-ids` refused `video-poster` passed as a prop.** Moving a testID literal
  out of a `testID=` position makes it invisible to the verifier — the same rule that cost 005
  three attempts. The ternary lives in `MediaPager` now.
- **It also refused `tab-home`.** The tab key is `feed`. Its own error message says "this is
  how `pref-message` passed while the switch did not exist".
- **`surface-routing` went red** because its notifications probe stubbed a repository that had
  grown two methods — a stub agreeing with an older shape is the `ApiPage<T>` failure in
  miniature.
- **An unchecked setup call cost three test failures.** `following-feed.spec.ts` built handles
  by hand, every follow 404'd, and the feed was correctly empty. The helper asserts its own
  204 now: an unchecked setup call is how a test fails somewhere other than where it broke.

### What Phase B added, and the same pattern in two more places (US4-US6)

Record: `docs/verification/runs/2026-09-09-008-phase-b.md`. US4 send-a-post, US5 avatars,
US6 post search.

- **`avatarKey` had no writer, and `avatarUrl` was emitted on ONE of seven profile
  projections — as the RAW STORAGE KEY**, which a private bucket answers 403 to. That is
  006/R4b's defect in a second place, and the fix is the same shape as the one that ended it
  the first time: **`profile.projection.ts` is now the ONE place a `PublicProfile` is built**,
  and it presigns. `one-profile-projection.spec.ts` was red against the shipped product in
  nine places across seven files, needing nothing broken on purpose.
  **Its first version matched a single line and found only seven of the nine** — silently
  passing over the multi-line ones, **including the file that emitted the raw key**. A guard
  that finds most of a defect is how the rest of it survives.
- **US4 adds NO visibility surface, and that is recorded rather than assumed.** A sent post is
  delivered as a message carrying a postId, so the recipient reads it through the post
  surfaces that already exist. A send that widened what a recipient may see would be a second
  visibility decision, which Principle II forbids —
  `contracts/visibility-matrix-delta.md` §3a says so in writing.
- **Post search needed a THIRD fan-out to the term index.** Publish and caption-edit were
  obvious; `updateProcessingState` writes index rows when a post becomes ready, and a term row
  is an index row. Reading the file did not find it. `post-search.spec.ts` did, by publishing
  a post and then failing to find it.
- **FR-021 is FR-009 on a second surface**, so the guard is literally the same code:
  `tests/unit/support/forbidden-imports.ts`, shared by the Following feed and search. Four
  copies of a comment-stripping import scanner is four places to get it wrong. The server half
  cannot see the client half either — dwell is measured on the DEVICE — which is why
  `PostSearchResults` passes no `onViewableChanged` to the waterfall.
- **`meta.terms` and `fallback` are declared response fields, and Phase B gave them a
  READER.** `response-shape.spec.ts` asserts the SERVER populates every declared field and
  structurally cannot see the other direction: a field the server populates and a client
  ignores. That is 007's `ApiPage<T>` and 008's `media[0]` — the API returned all ten
  photographs the whole time. Only a client finds it.

**Two test failures that were the tests, not the product**, both in the FR-022 fallback
journey and both worth keeping:

- It passed alone and failed in the full suite with `items: 3`. It searched a real catalogue
  interest's NAME, and other journeys publish captions containing the catalogue's own words.
  **The local table is shared across runs and this is the third "regression" here that was a
  grown table.** Rewritten to search a per-run **nonce** naming both a created sub-interest and
  a second actor, so both fallback halves are non-empty BY CONSTRUCTION.
- The first version of that fix searched as the person carrying the nonce and found nobody,
  because `PersonSearchService` excludes the viewer from their own results.

### PHASE A RUNS ON ANDROID: 23/23, run 49, 2026-09-09

Record: `docs/verification/runs/2026-09-09-008-phase-a-device-record.md`. Booted in 63s, no
retries, no device drop. Asserted through the SERVICE, and two of these lines did not exist
in the product a day earlier: **`PUT /v1/notifications/read` 204 x4** (US2's writer) and
**`GET /v1/feed/following` 200 x23** (US3's surface), plus **11 uploads for 9 posts** — one
post carried three images end to end (US1). `docs/screens/android/05-home-feed.png` shows
both feed tabs live and a **`1/3` badge** on the multi-photo card.

**It took two runs and both of run 48's failures were mine.**

- **A GLOBAL index in a testID.** Adding two sample images moved the video from
  `media-item-video-1` to `-3`. The id already carried the KIND for exactly this reason and
  still carried a global index — half a fix — and `verify-maestro-ids` passed the broken
  selector, because **a computed index under a dynamic prefix is what it cannot see**. The
  index is per-kind now, so sample media can never renumber it again.
- **`MediaPager` mounted and collapsed to zero height** — no `flex` inside an `aspectRatio`
  frame. **Nine component assertions were green throughout and none was wrong**: RNTL performs
  NO LAYOUT, so a tree that mounts and a tree that occupies space are different claims and
  only the first is testable there. Same shape as the profile grid 007 shipped.
  **Measured before changing anything**: `browser/media-pager-fit.spec.ts` reproduced it in 38
  seconds with the reason attached — `locator resolved to HIDDEN <div
  data-testid="media-pager">` — where the emulator took 36 minutes to say "not visible". The
  component tests fire `layout` explicitly now rather than hiding the dependency.

### PHASE B RUNS ON ANDROID: 26/26, run 51, 2026-09-09

Record: `docs/verification/runs/2026-09-09-008-phase-b-device-record.md`. Booted in 62s, no
retries, no device drop. Read as DELTAS against run 50, because every one of them is the line
a fixed flow was supposed to add and nothing else moved: **`POST /v1/media/uploads` 12 -> 13**
(the avatar upload), **`PATCH /v1/me` 1 -> 3** (set AND removed, FR-017 both directions),
**`PUT /v1/conversations/with/:handle` 2 -> 3** and **`POST .../messages` 4 -> 5** (a post sent
to somebody never messaged), plus `GET /v1/search/posts` 200 x11, which passed in both runs.

**It took two runs and both of run 50's failures were mine.** Run 50 was **24 of 26** — I
first reported it as "22 of 24" WITHOUT COUNTING THE FLOWS, which is the same habit these
records exist to check.

- **A MAESTRO SELECTOR IS A REGEX, and mine matched a text field.** `share-person-.*` selects
  a recipient whose handle the flow cannot know; the search field was `share-person-search`,
  matched the same pattern, and renders FIRST. The tap focused the field, nothing was sent,
  and the run showed **no 4xx on any path** because there was nothing to refuse.
  **The browser settled it in 3.9 seconds** (`browser/share-sends.spec.ts`: publish, open,
  share, tap a real recipient, sheet closes) where the device took 35 minutes to say
  "still visible". The flow also claimed it was "sending to yourself", which
  `PersonSearchService` makes impossible — **the same fact that had broken a journey of mine
  an hour earlier**.
- **The avatar handed off to a system window nothing could close.** `onChangeAvatar` awaited
  `library.pick()`, which opens `com.android.documentsui` on a device. 12 uploads for 10 posts
  said so before any theory did: no avatar upload was ever attempted. Compose never had this
  problem because it shows the app's OWN picker with the gallery behind an explicit control;
  setting a picture takes that route now. No browser journey could have caught it
  (react-native-web has no native picker) and no screen test either — the container test does.
- **`verify-maestro-ids` had been misreading selectors since it was written.** Its id capture
  class excluded `*`, so `share-person-.*` was read as `share-person-.`. Fixed, then given the
  check it was missing: a pattern may not also match a declared literal. It immediately found
  `post-.*` matching `post-detail-screen`, `post-caption`, `post-media` and `post-image` in six
  flows — working **by luck rather than by meaning**. A postId is a ULID and the selectors say
  so now.

### What Phases C, D and E added (2026-09-09) — ALL FIVE PHASES ARE NOW IMPLEMENTED

Records: `docs/verification/runs/2026-09-09-008-phase-c.md`, `…-phase-d.md`, `…-phase-e.md`.
C is US7-US11 (replies, comment edit/delete, mentions, alt text, drafts); D is US12-US14
(mute and dismiss, private accounts, moderation notices and appeals); E is US15
(collections) plus the close-out.

**The visibility matrix is 1,488 assertions across 16 surfaces, zero skipped** (was 564 after
Phase A, 606 after C). Most of that growth is NOT new surfaces: US13 added two DIMENSIONS —
a `pending-follower` relationship and an author-privacy axis — and both apply to every
existing surface. A rule that changes the answer everywhere has to be asserted everywhere, or
"it is one clause" is a claim rather than a measurement.

Since 2026-09-11 those two numbers are pinned against `BASE_SURFACES` and a derived
`baseTotal`, not against the composed list — raising either is still the same deliberate
edit, it just no longer collides with a fork's own surfaces. See "The overlay seams" above.

- **THE PLAN HAD EVERY SURFACE CARRY `authorPrivacy`, AND THAT WAS WRONG.** T181/T184 said to
  populate the field in each `toCandidate`. Privacy is a property of the AUTHOR, so that means
  either denormalising it into every index row — a flip would then need a re-index, which
  FR-044 and 001/FR-017 forbid — or asking thirteen surfaces to populate a field where
  forgetting one leaves a private account public on that surface. The boundary reads it
  itself instead (`RelationshipCache.isPrivateAccount`), memoised per request, consulted only
  on a `public` post for a non-author, and **failing CLOSED** if the read throws. The evidence
  is that `privacy-is-not-per-surface.spec.ts`'s allow-list got SHORTER: **no read path is on
  it.**
- **A private account answers 403, not 404**, and three test expectations of mine said
  otherwise. Only a BLOCK must be indistinguishable from absence; a private account is a
  stated fact on the profile, so the error may say so.
- **`OperatorGuard` threw 401 where `openapi.yaml` documents 403** on every moderation route.
  002's first defect in a smaller place — the contract and the API disagreed and each looked
  right alone. Found by T199's operator-route snapshot, which also found that
  `auth-surface.spec.ts` had **PATCH and DELETE transposed** in its `RequestMethod` lookup,
  invisible for two features because every route in the public snapshot is a GET.
- **FR-046 needed a second row, not a second query.** The append-only moderation log is
  partitioned by MONTH — right for an audit trail, useless for "what was removed of mine".
  The same event is now written to the recipient's own partition (A57) **by the same call**,
  so a removal that is logged and never explained cannot be expressed. Before 008 the author
  of a removed post got a `comment` notification from `SYSTEM` with no subject and no reason.
- **An appeal is filed against a NOTICE, not a subject id.** That is the whole authorisation
  model: a notice lives in its recipient's own partition, so "may this person appeal this" is
  a read rather than an ownership chain that has to be right for four subject kinds.
- **FR-051 is enforced by a TRANSACTION.** A collection add writes the membership row and the
  `savedPost` rows together, so a post cannot be in a collection and absent from the saved
  list by any path — including the one where nothing was saved beforehand, which is the path
  a "move" implementation passes because there is nothing to move.

**Two tasks turned out to be a "no", and the reasons are the deliverable.**

- **T210: collection names are NOT reportable.** A collection is readable only by its owner,
  so its name has an AUDIENCE OF ONE. There is no reporter, and a subject nobody else can see
  would be an undecidable queue item — which is why `report.service.ts` already refuses a
  report against an unnamed conversation. 005's conversation name is different in the way
  that matters: every participant sees it. So `CollectionRepository` has no `removeName`; a
  remover nothing can call would be the sixth declared-half-with-no-other-half.
  `collections-are-not-reportable.spec.ts` pins the reasoning AND the condition that
  overturns it — it fails the moment a collection route stops being on `/me`.
- **T217 said "17 surfaces" and there are 16.** The delta contract numbers the saved list as
  surface 17 while re-asserting it under the privacy axis, but it was already surface 9.

**T224 — grep the COPY, not only the code — found two live defects**, which is the whole
argument for having it as a task. 007 shipped a follow hint describing a withdrawn
requirement because only the code was updated.

- The share sheet said NOTHING for a public post — which reads as "anyone can open this" —
  and a public post by a private account is evaluated by the `followers` rule. The post's
  visibility really is `public` and the switch really was exhaustive, so nothing in the code
  would have shown it.
- The saved list's empty state told somebody to save a post they had already saved: true of
  the whole list, wrong of an empty shelf, and describing a product where a collection is a
  box.

### Run 52 cost two flows, and the two failures were different in kind

**`23-multi-photo-post`: US10's description box made the publish button unreachable.** It had
passed twice and failed on the first run carrying a per-image description field.

MEASURED at the emulator's own viewport — the AVD's colour buffers are 320x616, and 320 is
the number that matters:

| at 320x616 | before | after |
|---|---|---|
| `upload-slots` height | 404 | 198 |
| `interest-option-0` bottom | 753 | 547 |

Three 104pt tiles do not fit across 320 minus padding, so they wrapped to a second row, each
row 198pt tall because of the description box, and the interest picker — **required to
publish** — landed ninety-three points below the fold. The media strip scrolls SIDEWAYS now:
bounded at one row for any number of media. `browser/compose-fit.spec.ts` asserts the
INVARIANT with the fold as its consequence, because a guard asserting only the number passes
again the moment a tile shrinks.

**`31-mention`: THE ASSERTION COULD NOT HAVE PASSED ON ANDROID.** It asserted
`mention-<handle>`, the testID `MentionText` puts on the handle — a NESTED `<Text>` inside
the caption's `<Text>`, which Android renders as a span in one TextView rather than a view of
its own, so it has no node for Maestro to find. `verify-maestro-ids` resolves it happily; it
reads the source, where the id certainly exists. Same blind spot as a computed index under a
dynamic prefix. The product was fine, established in a browser before anything was changed.
**Device coverage of a mention link's TAP is a real gap** and the flow says so.

### The lesson that keeps paying: prefer the free observation

Phases C-E spent about twenty seconds of browser time to avoid several device runs:

| Found in a browser | Would have cost |
|---|---|
| compose's fold defect, with the numbers attached | the run it did cost, again |
| two navigation bugs in my own collections test (a pushed screen has no tab bar, 005/J-21) | two runs |
| the mention link works — so the flow, not the product, was wrong | a run spent on the wrong theory |
| `share-person-.*` matching a text field (run 50) | 35 minutes to say "still visible" |

And the corollary, which cost real time in Phase D: **check the local table's size before
believing a paging failure.** Two suites failed with 2,903 people accumulated across runs.
Third occurrence; it is written down so the next one costs a count rather than an
investigation.

### 008 RUNS ON ANDROID: run 59, 2026-09-09 — every journey, every check

Record: `docs/verification/runs/2026-09-09-008-device-record.md`. Booted in 63s, no retries,
no device drop, and the runner's own closing line rather than a count I made up: *"PASS: the
real APK ran on Android, exercised the real API, and completed the journeys."* Asserted
through the SERVICE — `PUT /v1/posts/:postId/dismiss` 204 and `PUT /v1/people/:handle/mute`
204 (US12), `PUT /v1/me/follow-requests/:handle` 204 (US13), `POST /v1/appeals` 201 (US14),
`POST /v1/me/collections` 201 with `PUT .../posts/:postId` 204 (US15), `POST /v1/me/drafts`
201 (US11), `PATCH` and `DELETE` on a comment (US8), `GET /v1/search/posts` 200 x11 (US6).

**FR-040 is why the aggregate matters more here than anywhere else**: neither mute nor
dismissal may leave a trace on any screen, so a control that set a local flag and sent
nothing would satisfy every visible assertion in its flow. Those two 204s are the only
observation that can tell them apart.

**It took four runs and all four failures were mine, none the product.**

- **Run 56 proved that evidence which prints only at the END may never print at all.** The
  per-flow evidence block added the run before lived after the journeys loop; Maestro wedged
  inside `30-edit-delete-comment` and the job's `timeout-minutes: 90` killed the step 47
  minutes later, so the loop never finished and the block printed nothing — for the first
  failure it existed for. Run 40's mistake in TIME rather than in space. `flow_evidence` is
  called at the moment a flow fails now, and `maestro test` is bounded by
  `timeout --kill-after=30s 480` so a wedge costs one flow instead of the run and the six
  behind it. **The wedge itself is undiagnosed** and is written down as such.
- **Run 58 passed every flow and failed anyway, correctly.** `34-private-account` turned the
  device's account private and left it there; the post-journey place check asks with NO
  TOKEN; a public post by a private account is evaluated by the `followers` rule (FR-044).
  US13 working on a surface nobody had thought about it on — and invisible for six runs,
  because the journeys block exits on the first failed flow and that check had not run since
  run 51. The flow puts the account back now (a toggle is not idempotent and flows share ONE
  SERVER, 005/J-20 again), which buys FR-043's other direction the way `27-set-avatar` covers
  set AND removed. The anonymous check is the assertion for it: it cannot pass while the
  account is still private.
- **The three run-55 failures were settled without spending a run on any of them.** `33` never
  left post detail (`onDone` is `pop`; `post-<ULID>` exists on `PostCard`/`PostTile` and the
  detail screen renders neither — zero of them counted in a browser in 3.1s). `12` asserted a
  post 466 points below the fold (recency-ordered interest space, y=1082 on a 616pt screen,
  and `assertVisible` does not scroll). `57`'s `mute-person` sits at y=676 on 616 — run 35's
  block control again.
- **`23-multi-photo-post` is A MARGIN, NOT A CAUSE I OBSERVED.** `MediaPager` is a
  `pagingEnabled` ScrollView with a 288pt pitch, so a release advances only past 144 — and an
  element-relative swipe travels from the pager's centre to about its edge, which is 144.
  Exactly the threshold is where pass, fail, pass, fail lives. No swipe of this flow has ever
  been watched, and the record says so instead of inventing the observation.

**And a miscount of my own: I reported run 57 as "35 of 36". It was 33 of 34.** There are 34
flows — `05` and `07` do not exist — and I read the denominator off the highest flow NUMBER
instead of counting the files. This file already records that exact habit from run 50. Second
occurrence. **Count the flows.**

### Still not verified for 008, and must be reported that way
- **Native font scaling.** `safety-fit.spec.ts` measures layout at 130% text in a browser and
  says so; react-native-web ignores the platform font setting entirely, which is why 006's
  `Avatar` overflow was invisible there. **A browser result does not close SC-017.** Every
  control the feature added is covered on the SCREEN-SIZE half only, and that has been the
  position since 006 — including every fit measurement run 59 depended on.
- **A mention link's tap on a device**, above.
- **`23-multi-photo-post`'s swipe cause** and **run 56's wedge**: a margin was widened and a
  timeout was added, and neither cause was observed.
- iOS, 002/SC-002 (10,000 concurrent), real usage, and the datastore and hosting decisions
  are all unchanged by 008 and all still open.

## What spec 007 built (2026-09-08) — all eight phases

`specs/007-ranked-feed-redesign/` replaces the composed feed with a **ranked**
one and rebuilds the app on the approved design. **All eight phases are
implemented and the full CI step list is green.**

**This heading was true before T051–T054 were done, and I wrote it anyway.**
Nine screens — profile, edit profile, saved, inbox, conversation, new group,
activity, compose, media picker — were still carrying 006's design while this
file and my own report said the redesign was finished. Nothing caught it: every
suite was green, because the screens WORKED; they were simply not the approved
design. The task list said so the whole time, in four unchecked boxes.

The lesson is narrow and worth keeping: **a green suite says the code runs, and
`tasks.md` says what was built.** Check the boxes before writing "complete" —
the checklist is the record, and it was right when I was not.

`design/007-ui/` is the approved design (20 artboards). It is settled — implement
it, do not reopen it.

### The redesign, and the numbers behind it

- **The palette INVERTED.** 006's signature was dark forest green; 007 is warm
  paper — page `#FBFAF8`, white cards, one accent `#1F6B3F`, **no shadows
  anywhere**. Depth is the card on the page, the gutter and a 14pt radius.
  `elevation` is DELETED from tokens, not zeroed: a name that does not exist is
  a typecheck failure the moment somebody writes it.
- **Contrast is computed, and it moved two values.** The artboard's faintest
  grey `#8A948C` is 2.9:1 on white and is not a token; `text.muted` is `#606C66`
  (`#6B7770` measured 4.14:1 on the field surface). The interest lightness is
  0.52 because 0.56 puts the worst of 360 hues at 4.19:1.
- **The feed is a block-wise waterfall** (research R6): `numColumns={2}` renders
  bottom-synced ROWS, and two lists in a `ScrollView` nests VirtualizedLists and
  disables windowing. Blocks of 8, one `FlatList`.
- **An interest is a COLOURED WORD**, never a chip. The testID stays
  `interest-chip-<slug>` — the preservation contract is about the id and what it
  marks — and `interest-is-a-word.test.ts` asserts the RENDERING instead.
- **SC-012 measured**: whole feed worst p95 **166.5ms**, the ranking's own share
  **34.9ms** (~20%), at 6,000 posts / 600 people against DynamoDB Local. NOT at
  001's 100k/10k scale, and it says nothing about a provisioned datastore.

### Phase 5-8 defects, all found by measuring rather than looking

1. **The interest word cost 43 POINTS ON EVERY CARD.** It used the shared
   `touchTarget`, so a 16pt word occupied 44 points of LAYOUT. `hitSlop` is what
   that case is for. Measured at 360x640 it was the difference between two posts
   visible and four — which is SC-008.
2. **THE INTEREST SPACE WAS UNREACHABLE FROM POST DETAIL.** Bare `Text` in the
   ACCENT colour with no press handler: named on the one screen that names it,
   reachable from nowhere. Identical to the defect 004 recorded for places, two
   paragraphs below it in the same file. Worse after 007, because the feed no
   longer reads the interest graph.
3. **A rating star was `padding: 4` around an 18pt glyph** — about 26 points,
   shipped, on a control whose whole job is precise tapping. Invisible to the
   old touch-target guard, which asked whether a FILE mentioned a size anywhere.
4. **The device runner was calling a DELETED fixture.** `seed-fr033-fixture.ts`
   went with the withdrawn requirement and `android-device-pass.sh` went on
   invoking it — a break costing a whole 25-minute run to discover, which
   `verify-maestro-ids.mjs` cannot see because the variables were still passed.
5. **Skipping the cold start was unrecordable**, so the app would ask again on
   every sign-in: `seedInterests.length` cannot tell "answered none" from "never
   asked". The disclosure carries `coldStartComplete` now.

### Guards that were asking the wrong question

- **Touch targets were checked PER FILE.** One sized control approved every
  other one in the same file, and the tab bar alone holds six. Per-tag now.
- **`text-has-colour` accused `primitives.tsx`** — the file whose job is to give
  every Text a colour — because a DOC COMMENT contained `<Text style={{...}}>`
  as an example. The usual failure is a comment making a guard pass over a
  violation; this is the mirror. Comments are stripped, blanked LINE BY LINE
  because the guard reports a line number.
- **Both stricter guards first cried wolf on eight correct files**, for the
  reason already recorded: `<Pressable onPress={() => x()} style={...}>` has a
  `>` inside a prop, so scanning to the first `>` stops before the style.
- **SC-001's test asserted exploration noise.** It checked the gap between the
  two interests AND the engaged set's absolute position; the absolute half
  failed at 3 against 2 while the gap behaved correctly. SC-001's own wording is
  "comparing positions", which is the gap.

### Two rules the redesign re-proved

- **A PUSHED SCREEN HAS NO TAB BAR.** Signing in lands on the cold start, which
  broke all fifteen browser journeys, the capture script and every Maestro flow
  that chains `01-sign-in` — exactly what 005/J-21 recorded. Racing the two
  possible next screens is the fix; polling for one finds the loading
  placeholder and sails past.
- **Flows share ONE SERVER.** `22-cold-start.yaml` needs its own account:
  `clearState` clears the device, not the server, and FR-014 asks once per
  ACCOUNT. Reusing the device token would fail for a reason that is the product
  working.

**Constitution amended to 2.0.0.** Principle I rewritten, Principle II
strengthened. See the summary near the top of this file.

**Established:**

- **THE COMPOSED FEED SATISFIED PRINCIPLE II BY ACCIDENT.** It read only
  partitions the viewer had subscribed to, so its candidate set was already
  viewer-scoped and could not over-admit whatever the ordering did. Nothing
  asserted the boundary's POSITION. A ranked feed reads across the catalogue,
  which removes the accident - hence `contracts/ranking-boundary.md`, a
  build-failing dependency guard (`ranking-cannot-admit.spec.ts`) and a
  behavioural one (`ranking-boundary.spec.ts`, C2-C5).
- **An interest follow had to be given a meaning again.** Withdrawing
  001/FR-032 left the follow control in the app doing NOTHING, and neither the
  withdrawal list nor `/speckit-analyze` caught it - four 001 suites going red
  during implementation did. **FR-030**: a follow is a STANDING DECLARATION
  worth one unit, the same as a like. It adds weight, never a boundary.
- **The place-follow guard was reading the wrong file.** It guarded
  `feed.service.ts`, which no longer chooses candidates. Widened to
  `RankingService` and `CandidateSource`, verified red on a real import.
- **Exploration is CORRECTNESS, not taste** (FR-007). A purely exploitative
  ranker is a positive feedback loop: it shows what the profile favours, the
  profile updates only from what was shown, so the signals that would broaden it
  are never generated. No later tuning helps - the data was never collected.

### Four defects, and not one was visible to a green suite

1. **THE APP HAD NEVER LOADED A SECOND PAGE OF ANYTHING.** `ApiPage<T>`
   declared `nextCursor` at the top level; every list endpoint nests it under
   `page`. `usePaged` read `undefined`, marked every list exhausted, and
   infinite scroll stopped after page one - feed, interest spaces, profiles,
   comments, notifications. `emptyStateHint` never arrived either, so no empty
   state has ever rendered from a real response. **Five features of green tests,
   because every mobile test STUBS the data layer and the stubs were wrong in
   exactly the same way the type was** - they agreed with each other and neither
   agreed with the server. Only a request found it.
2. **The feed crashed on its SECOND render.** `FlatList` throws on a changed
   `onViewableItemsChanged`; an inline arrow is a new identity every render. I
   guarded the `viewabilityConfig` object and missed that the callback carries
   the same rule. 165 mobile tests green - none renders a real `FlatList` - and
   every browser journey timed out with no reason given. **Found in seconds by
   attaching a page-error listener.**
3. **A viewer with nothing declared got an EMPTY feed.** Exploration drew four
   random interests from a catalogue of hundreds, most of which hold no posts.
   Unit tests stub an index where every partition is populated, so the emptiness
   only exists against a real sparse catalogue. An under-filled page now reads
   more partitions, bounded twice over.
4. **Every signals route answered 500, and 404 before that.**
   `@Controller('v1')` under a global `v1` prefix gives `/v1/v1/...`, and the
   caller was read from `req.user` - Passport's convention, not this app's.
   Invisible to typecheck, lint and `smoke:boot`, which checks other controllers.

### Guards whose FIRST version was wrong, in an instructive way

- **The boundary contract compared two different draws.** It called
  `RankingService.rank` separately and compared to a separate HTTP response -
  but exploration re-samples per call, so the two sets simply differ and the
  comparison said nothing. The proposal is now intercepted inside the request
  that served it.
- **A privacy assertion written from its own prose.** It checked the victim's
  userId was absent from every surface and failed on `GET /people/:handle`,
  which returns that id because it is their profile. FR-013 protects what the
  SIGNALS say, not the existence of the person. It then scanned the disclosure
  endpoint for signal-shaped keys - the one surface where that shape belongs.
- **The dwell test captured `undefined`.** Reading
  `AppState.addEventListener.mock.calls` off a function that is not a mock under
  the RN preset delivered no background event, and reported the hook as broken
  when the test was.

### 007's own reminders, all of them old lessons in new places

- **A toggle is not idempotent and a PUSHED screen has no tab bar.** Signing in
  now lands on the cold start, a pushed screen, which broke all fifteen
  navigation journeys in one commit - exactly what 005/J-21 recorded.
- **`/speckit-analyze` missed 001/FR-032 entirely.** The withdrawal list, the
  analysis pass and I all read past the sentence the whole feature replaces.
- **Two local suite failures were NOT regressions.** `people-search-scale` and
  `review-moderation` walk a bounded page of a shared table that had grown to
  3,875 people across runs. Dropped and reseeded the local table: 825/825.
  **Check the table size before believing a paging failure.**

### Found during 007's verification phase, which is the argument for having one

- **Four Phase 5 tasks were never done while I reported eight phases finished.**
  See the note under the heading above. `tasks.md` was right and I was not.
- **"New followers" was a notification you could switch on that could never
  fire.** `follow` is a declared kind — schema, `describeNotification`, a toggle
  in Edit profile — and `PersonFollowService` published no event, so nothing
  subscribed. 004/FR-031's message toggle inverted: there the notification
  existed and the control did not. **Check both halves of a requirement.**
- **The follow hint on every profile described a WITHDRAWN requirement**, and a
  test was pinning it there. It promised prominence "inside interests you
  already follow" — 001/FR-033, which 007 withdrew — so the app explained the
  composed feed to somebody using the ranked one. When a requirement is
  withdrawn, grep the COPY, not only the code.
- **A guard that accepts a mechanism is not measuring a size.** The
  touch-target guard skipped any `Pressable` mentioning `hitSlop`, so
  `hitSlop={{ top: 1 }}` would have passed. Made to do the arithmetic, it
  immediately found the interest word's horizontal target at **36.7, not 44** —
  under a comment claiming "44 in every direction".
- **`browser/measure.spec.ts` had ZERO assertions** and I committed it in Phase
  5. It published eight posts, logged boxes and passed unconditionally. A test
  that cannot fail is worse than no test: it counts as coverage. Deleted.
- **Three claims in `data-model.md` and `research.md` matched no code**: a
  partition key `PERSON#` that has never existed here (it is `USER#`), sort keys
  missing their leading `#`, and an "atomic add" that is a read-modify-write and
  says so in its own repository comment.
- **Run 40's evidence was printed where nothing could read it.** The whole-run
  API aggregate — which this file calls the single most useful artifact in these
  runs — was printed FIRST in the evidence step, above a logcat filter, a logcat
  tail, an emulator dump and **eighty-five resource rows that never move**. Job
  logs come back only as a tail; the artifact is on a blob host this
  environment's egress denies with a 403. Two tails, 380 lines, never reached
  it. **The aggregate and the flow results now print LAST and also go to
  `$GITHUB_STEP_SUMMARY`**, and the resource samples are summarised to first,
  last, extremes and any sample where adb did not say `device`.

### Still not verified, and must be reported that way

- **007 RUNS ON ANDROID: 20/20, run 43, 2026-09-08.** Record:
  `docs/verification/runs/2026-09-08-feature-007-record.md`. Asserted through
  the SERVICE: **`POST /v1/signals` 201 eleven times** and
  `GET /v1/me/feed-signals` 200 nineteen times — 007's whole premise, working on
  a device — plus 26 `GET /v1/feed/home` 200, 8 publishes, 2
  `POST /v1/me/seed-interests` 201 (the cold start), `POST /v1/reports` 201, the
  full group lifecycle, and 2 `PUT /v1/places/:id/rating` 200.
  **It took six runs and four of the five failures were mine** — see "A soft
  keyboard cannot be measured in a browser" above.
- 001/SC-011 (a video PLAYING), iOS, 002/SC-002 (10,000 concurrent), real usage,
  and the datastore decision are all unchanged and all still open.
- **SC-002's 60-second half needs a person.** The journey asserts the PATH is
  populated at every step, which is what a test can honestly measure; a
  stopwatch here would be timing this machine.
- **A working light/dark switch is still not claimed.** Both palettes exist and
  both pass contrast; `useTheme` deliberately does not follow the platform,
  because screens read the palette at module scope and a style object built at
  import time cannot call a hook.

## What spec 006 built and established (2026-09-08)

`specs/006-ui-redesign/` is the UI redesign: a dark green brand, a full design
system, and a shared post card. Three stories, 29 FRs, 9 SCs, 48 tasks.

**Established:**

- **THE APP COULD NOT FETCH ITS OWN MEDIA. Not on any surface, not in any
  client, and it never could.** `MinioObjectStore.publicUrl` returned an
  UNSIGNED url for a PRIVATE bucket, so every `<img>` got 403. Nothing noticed
  for five features because nothing had ever put an image on a browse surface -
  the device flows assert API calls rather than pixels, and `PostDetailScreen`'s
  `Image` was never looked at. `PostCard` was the first thing to render one, and
  the frame came up empty. Fixed by **presigned GET urls** (R4b), issued inside
  `PostQueryService.toMediaItem`, which runs only AFTER `VisibilityFilter` has
  decided this viewer may see this post. 15 minutes, signed against the PUBLIC
  endpoint because a signature covers the host.
- **Interest colour is derived, in OKLCH, and legibility is true by
  construction.** A hue comes from an FNV-1a hash of the interest id (a
  sub-interest borrows its parent's, so a family reads as a family); OKLCH is
  perceptually uniform in lightness, so fixing L fixes contrast for every hue at
  once. The contrast test enumerates the WHOLE generated space - all 720
  colours, both palettes - rather than sampling. Out-of-gamut colours are fitted
  by REDUCING CHROMA, never by clamping channels, which shifts hue.
- **Deleting a shim is a stronger guard than testing for it.** The
  `theme.color.*` / `theme.font.*` alias layer existed so ~40 screens could turn
  dark green in one diff. Once every call site moved, it was deleted rather than
  left exported: a name that does not exist is a typecheck failure the moment
  somebody writes it again.
- **`theme.font.X` carried a SIZE AND NOTHING ELSE**, so every screen outside
  `ui/` rendered with the platform's default line height and the type scale's
  `lineHeight` was dead data everywhere except `primitives.tsx`. FR-018 asks for
  roles; the app was using a quarter of one. That is why the migration was worth
  finishing rather than deferring a third time - it was never only a rename.
- **G1: the interest treatment belongs to interests ONLY**, enforced by
  `interest-treatment.test.ts`. A place or a person carrying it would say that
  following them widens your feed, and following a place deliberately does not
  (004/FR-019). Principle I, in the visual language.

### Guards that passed for the wrong reason, and a cause I asserted wrongly

- **`N-04` had never tested the guarantee it names.** It builds
  `${s3Endpoint}/${bucket}/${rendition}` while `rendition` is ALREADY A FULL
  URL - a url nested inside a url, which errors whatever the bucket permits. I
  reported that opening the bucket "made private media readable and broke
  N-04"; the second half was wrong and I had not read the failure, which went
  404 → **400**, not to a successful fetch. Reverting the open bucket was still
  right, for a reason I had not given. N-04 now extracts the key.
- **`text-has-colour` could not see an arrow function**, and
  `no-hardcoded-style` was scoped to `features/` - so `#d97706` sat in
  `primitives.tsx`, the file that exists to stop exactly that. The definition
  layer is the one place a value-drift guard cannot look. Found by reading.
- **My own safety/empty-state test invented its hint values** (`'no-follows'`,
  `null`) where the product says `no_followed_interests` / `no_posts_yet`. It
  failed for its own reason, not the product's, which is the same shape as a
  guard that reads its own prose.

### Two defects a screenshot found that no test could

- **Every `<Text>` must choose a colour.** RN's `Text` inherits black. Under the
  old white theme that was invisible luck; against dark green it is near-black
  on near-black, and the post caption in every list did exactly that. The
  contrast test checks that TOKENS are legible against each other - a token
  nobody applies is a colour nobody sees.
- **Two palettes at once.** `useTheme()` followed `useColorScheme()` while
  everything else read a fixed dark palette, so the first `PostCard` capture
  showed WHITE CARDS INSIDE DARK GREEN CHROME. Not "dark mode is broken" - two
  sources of truth. `useTheme()` now returns `activePalette` and **does not
  follow the platform**, which is a stated limit: screens read the palette at
  module scope, and a style object built at import time cannot call a hook, so
  a real light mode needs every screen to build styles inside the component.
  FR-017 is met (both palettes exist and pass contrast); a working light mode
  is NOT claimed.

### A device-only defect, found by reading for what a device does differently

`Avatar` draws a letter sized from a fixed-diameter disc, so platform font
scaling grew the letter and not the circle and the initial spilled out of it.
react-native-web ignores the platform font setting, so no browser journey and no
screenshot in `docs/screens` could ever have shown it. `allowFontScaling={false}`
on that one glyph - correct rather than expedient, because the letter is
decorative, hidden from assistive tech, and stands beside a name that scales
normally. Guarded, because switching font scaling off is the easiest fix for any
text that overflows its box: a second opt-out fails the build, and the guard
also asserts Avatar still carries the one exception it allows, so deleting the
prop cannot make it pass for the wrong reason.

### 006 RUNS ON ANDROID: 19/19, run 37, 2026-09-08

Record: `docs/verification/runs/2026-09-08-feature-006-record.md`. Every flow on
its first attempt, no device drop, no retry. Asserted through the SERVICE:
`POST /v1/reports` **201** (the line that matters - it is absent from runs 35 and
36), 9x `POST /v1/posts` 201, `PUT /v1/places/:placeId/rating` 200, and the whole
group lifecycle.

**It took three runs, and the middle one was mine.**

**Run 35, 18/19.** `09-report-and-block` failed on `block-person is visible`, and
it was a real defect: **`Screen` was a plain `View` and never scrolled**, so the
safety sheet's content was not below the fold, it was UNREACHABLE. The thing out
of reach was BLOCK THIS PERSON, a Constitution IV release gate.

Measured rather than reasoned about, by `apps/e2e/browser/safety-fit.spec.ts`
rendering the sheet at the device's viewport:

| line metrics | block-person bottom | on a 640px screen |
|---|---|---|
| current | 665px | off screen |
| pre-006 | 627px | **inside by THIRTEEN PIXELS** |

006 made it worse and did not cause it. The type scale added ~38px; a longer
warning sentence, a larger platform font or a shorter phone would each have done
it alone. The screen was always one edit from hiding a safety control.

**Run 36, 1/19 - AND THAT ONE WAS MINE.** Having measured ONE screen, I set
`scroll` on all eight that render a `Screen` without a list, on a "same class of
defect" argument. `SignInScreen` became a `ScrollView`, sign-in stopped working,
and every flow chaining `01-sign-in` failed.

**How it was diagnosed matters more than the fix.** "Sign-in broke" is not
evidence. The whole-run API aggregate is: `GET /v1/me` 200 **three times**, all
host-side fixtures and none from the device, against 54 in run 35, with
`GET /v1/feed/home` 401 twenty times - the app was signed out the whole run. The
end-of-run screen dump still showed `sign-in-screen` with the token field holding
content, so the button was enabled and the tap simply did not take. **That
aggregate table is the single most useful artifact in these runs; read it before
forming a theory.**

Two ScrollView mechanisms fit: `keyboardShouldPersistTaps` defaults to `never`,
so a tap while the keyboard is up is spent dismissing it; and a keyboard-resized
scroll viewport leaves the submit button below the fold where a plain `View`
would have moved it above. **Neither is reproducible in a browser - there is no
soft keyboard** - so the other seven screens were REVERTED rather than fixed on
an untestable theory. They are not "safe", they are UNMEASURED, which is a
different claim. `keyboardShouldPersistTaps="handled"` is set because it is
correct under either mechanism.

**The lesson is not "test more".** A rule inferred from a single measurement and
applied to seven unmeasured cases is a guess wearing the clothes of a principle.
It cost a 27-minute run and took the product from 18/19 to 1/19. The guard
(`screen-scrolls.test.ts`) now covers only the case with a measurement behind it,
and `safety-fit.spec.ts` is the harness for measuring any other screen BEFORE it
turns `scroll` on.

**And a guard that passes is not a guard until you have watched it fail.** The
first version of `safety-fit.spec.ts` used `scrollIntoViewIfNeeded` and passed
with the defect still in place: Playwright scrolls the DOCUMENT, and a browser
page scrolls where a React Native screen does not. It walks the ancestors for a
container the APP scrolls now, verified red with the fix reverted.

## What spec 005 built and established (2026-09-07)

`specs/005-reviews-and-group-chat/` covers the two scope items the owner put back in:
**reviews and ratings on places**, and **group chat**. Three stories, 34 FRs, 12 SCs.

**SC-005 now runs 480 assertions**: 462 post assertions across 11 surfaces plus **18 review
assertions** on the twelfth. The review surface needed `Surface.kind` on the surface table -
without it the post matrix would have run its rows against a review surface and reported a
larger green number for a smaller thing.

**Established:**

- **`state` is no longer a property of a conversation** (R2). A group has no single state -
  Alice accepted, Bob has not looked, Jo declined - so the authority moved to the participant
  row. Legacy rows keep working because the meta item's state is still the fallback (FR-026),
  and `conversation-migration.spec.ts` proves it against rows written in the OLD SHAPE rather
  than against new ones the new code produced.
- **A pair id is derived; a group id is a ULID** (R1). That is not two schemes for the sake of
  it: a derived id cannot survive a membership change, and FR-020 requires the id to stay the
  same when somebody is added. A pair therefore cannot be promoted to a group - recorded as
  J-41 with a clean 404, not left to be rediscovered.
- **The 20-person cap is a CORRECTNESS constraint, not a product preference.**
  `TransactWriteItems` caps at 100 items and a group write is 1 meta + 2N rows, so 20 people is
  41. The next size up would not be a bigger group but a silently truncated one.
- **The rating aggregate is transactional** (R5): the rating row and the place counters move in
  one `TransactWriteItems`, so the sum and the count can never disagree with the rows.
- **The average is NOT filtered per viewer**, and that is a stated, accepted leak: a determined
  viewer could detect a blocked person's effect on an average by arithmetic. Filtering it would
  make it not an average. J-30 pins the behaviour rather than leaving it to be discovered.
- **A moderator removal takes the SCORE with it** (R6). Removal that only hid the text would
  leave an abuser's 1-star in the average, which is the assertion that would have failed.

### Three live defects, found by the guard that was written to prevent them

T075 asks for a structural guard that the moved `state` authority cannot come back. **It had
already come back, before the guard was written.** Three sites in `ConversationService` decided
from `view.state` directly - the message-count gate, the reply-accepts rule, and accept/decline
- each correct for every pair and reading the meta item's placeholder for every group.

Accept/decline was the worst: it called `setState`, which writes the meta item **and every
participant row**. So one invitee tapping Accept on a group invitation accepted it on behalf of
everyone who had not looked, and un-declined it for anyone who had said no.

Nothing caught it. Twelve tests exercise the request rules and **all of them hold pairs**, where
the conversation's state and both people's are the same fact. The defect is only observable with
three people in three different states at once, which is what
`tests/integration/group-state-per-participant.spec.ts` now constructs.

**The guard's first version was the wrong shape**: it counted reads of `item.state`, which cannot
tell a read from a write and cannot distinguish the legitimate FR-026 fallback from a new
offender. It now fails on a DECISION made from `view.state`.

And the lesson worth keeping: **a structural guard says the dependency is absent, never that the
behaviour is right.** Both are here, and the behavioural one was verified by reverting the fix -
three go red, the pair test stays green.

### The testID that took three attempts, and the guard that was right every time

`verify-maestro-ids` refused the inbox row's group testID three times running:

1. `group-row-Climbing Tuesday` - a space in a testID, and a Maestro selector is a **regex**.
2. A slug built by a helper function. The verifier reads dynamic prefixes off the **leading
   literal of a template in a `testID=` position**, so a function call hides the prefix entirely
   and every `group-row-.*` selector then matches nothing. It cannot see through a call and is
   right not to pretend it can.
3. Fixed by keeping the prefix in the JSX, where the guard reads it, and having the helper
   return only the suffix.

**A new check, because the selector checks could not see this one**: a flow using a `${VAR}` the
device runner never passes. Maestro does not error on an undefined variable - it substitutes the
literal text and then waits thirty seconds for an element with that name, twenty minutes into a
25-minute emulator run, looking exactly like a broken screen. Verified by removing one variable
and watching it fail.

### A test-harness trap worth not repeating

A stub whose `messages` resolves instantly turns `ConversationContainer`'s long-poll loop into a
**microtask spin**. The event loop starves, so jest's own `testTimeout` never fires either, and
the run hangs for 120 seconds with **no output at all** rather than failing. Counting the calls
made it visible in one run; guessing at it cost four. The stub now answers once and then hangs,
which is what the server does.

That is the same lesson as the six emulator runs, in a third place: **make the failure visible
before changing anything**, and prefer the free observation to the expensive guess.

### Still not verified, and must be reported that way

- **005 RUNS ON ANDROID: 19/19, run 34, 2026-09-07**, every flow on its first attempt with no
  device drop. Record: `docs/verification/runs/2026-09-07-android-run-34-005-pass-19-of-19.md`.
  Asserted through the SERVICE: `PUT /v1/places/:id/rating` 200, `GET /v1/places/:id/reviews`
  200 with an author, and the whole group lifecycle - `POST /v1/conversations/groups` 201,
  `.../participants` 204, `.../leave` 204 - with the group gone from the inbox the server
  returns afterwards.

  **It took three runs, and two of the three failures were navigation facts a browser settles
  in three seconds.** Run 32 (17/19): `20-rate-place` chained `16-place-page`, whose follow
  toggle had already fired, so the chained tap UNFOLLOWED and 16's own assertion correctly
  failed - a toggle is not idempotent and flows share ONE SERVER. Run 33 (18/19):
  `21-group-chat` waited for `tab-chats`, which does not exist on a PUSHED screen (`App`
  renders the tab bar only at the root of the stack), while that run's log already showed the
  group created 201 and a participant added 204. `005/J-21` in
  `apps/e2e/browser/navigation.spec.ts` now asserts both facts - `tab-chats` count 0 on a
  pushed screen, exactly one `open-group-` button - in 2,997ms. **Prefer the free observation
  to the expensive guess**, again.

  Two things worth not repeating. **A toggle is not idempotent, so a flow that chains another
  flow inherits its writes**: `20-rate-place` chained `16-place-page`, which had already
  followed the place ten minutes earlier, so the chained tap UNFOLLOWED it and 16's own
  assertion correctly failed. Each flow is its own Maestro session but they share ONE SERVER.

  And **a fixture must assert the search the flow actually runs**. `seed-group-fixture` checked
  that each member was findable by their FULL HANDLE, which passed; the flow searches a prefix,
  which is a different query. The check looked like evidence and answered nothing - the same
  shape as a guard that reads its own prose. It now asserts the one prefix query returns all
  three, and exports the prefix so the flow cannot drift from it.
- **001/SC-011** - a video PLAYING on a device. Unchanged by 005.
- **iOS**: nothing has ever run.
- **002/SC-002** (10,000 concurrent): unmeasured, and only a provisioned-DynamoDB run can close
  it. The owner declined the spend; report it unverified, never as met.
- **Real usage**: nobody has used the product. Retention, second-post rate and onboarding
  success stay unanswered.
- **The datastore decision** (`003/datastore-decision.md`) is the owner's and is recorded as
  **pending** - "decide later, keep building local", 2026-09-07.

## What spec 004 built and established (2026-09-07)

`specs/004-chat-places-and-depth/` is **implemented**: 128 of 140 tasks, five stories -
conversations, places, interest depth, the shipped-scope holes, saved posts. Record:
`docs/verification/runs/2026-09-07-feature-004-local-record.md`.

**SC-005 is closed**: the visibility matrix runs **462 assertions with zero skipped**, across
11 surfaces, and `surface-routing.spec.ts` proves each one CONSULTS the filter. The matrix
alone never could - every row runs the same `decide()`, so 462 assertions would otherwise
mean one function tested 66 times.

**004 now runs on Android: 17 of 17 flows pass** (run 29, 2026-09-07). Record:
`docs/verification/runs/2026-09-07-android-device-pass-17-of-17.md`. Effects are asserted
through the SERVICE - 8 x `POST /v1/posts` 201, 3 x message sends 201, an accept 204, a
place created and followed, a save, a comment, a report, `PATCH /v1/me` 200.

**Still not verified, and must be reported that way**: **001/SC-011 - a video PLAYING on a
device**. `19-publish-video` asserts the POSTER FRAME renders (FR-009) after a real upload
and transcode; it does not assert that playback starts. iOS: nothing has ever run.
002/SC-002: unmeasured. Real usage: unanswered.

### What the Android runs added (runs 26-29, 2026-09-07)

Four runs, four findings, and **not one of them was what I predicted**.

- **A transient adb disconnect, cause unknown - and recorded as unknown.** Runs 26 and 27
  both lost the device at flow 12 mid-`inputText`. Disk (99.8 GB free), memory (11.5 GB of
  16), swap (zero) and qemu RSS were all flat across the whole run, `adb get-state` read
  `device` in the sample immediately before, and qemu was still alive at the failure.
  logcat read fine seconds later, showing the guest's adbd re-handshaking (`host-13:
  already offline`). So the device drops off adb transiently and returns. **Do not write a
  cause for this into this file without observing one** - the last two plausible
  explanations here were both wrong and the second had to be retracted.
- **`maestro test .maestro/` holds ONE device connection for the whole suite**, so that
  momentary drop cost flow 12 and every flow after it: five failures in 10-40ms each, pure
  collateral, in both runs. Flows now run one Maestro session each and a retry fires
  **only** on a device-transport error, never on an assertion - retrying an assertion would
  hide exactly the defects this pass exists to find.
- **FR-031's message toggle did not exist in the UI.** `EditProfileScreen` kept a private
  three-entry `CATEGORIES` while `NOTIFICATION_CATEGORIES` had four; 004 added `message` to
  the list that DESCRIBES notifications, not the one that RENDERS the switches. Two lists
  for one thing: the duplicate is not a risk of drift, it IS the drift.
- **A flow-ordering coupling.** `14-message-request` waited on the friend's seeded message
  text in the inbox, and `13-send-message` replies into that conversation, so the preview
  correctly changes. It passed twice on Maestro's incidental ordering. A last-message
  preview is mutable by definition; assert on what identifies the row.

**`verify-maestro-ids.mjs`'s dynamic-prefix blind spot is closed.** A plain-string selector
under a prefix now resolves against literals in the file that builds the id and the modules
it imports AS VALUES (type-only imports skipped - that distinction is the whole check).
Closing it took two attempts, and the second is the lesson: the file I reverted to
reproduce the defect still carried **my own comment** naming `message` as the fourth
category, and that comment alone made the selector resolvable. **A guard that reads prose
describes the intention, not the build.** Comments are stripped now.

**The observation lesson landed twice.** Run 26's evidence dump printed a logcat captured
ELEVEN MINUTES BEFORE the failure and wrote the disk figure into an artifact this sandbox
cannot download - so it looked like evidence and answered nothing. Adding a 15-second
sampler and an after-the-run logcat ruled out both suspects on the very next run. This
project already had "make the failure visible before changing anything" written down from
the six emulator runs; I reproduced the mistake in a new place anyway.

### Six defects, all pre-existing, all found by a request

004 introduced none of these.

1. **The interest space returned VisibilityFilter's candidate rows** - no caption, no media,
   no author, no counts - on the product's PRIMARY BROWSE SURFACE. Sixth instance of that
   defect. It survived because nothing asked: journeys compare postIds, the matrix tests the
   filter rather than the response, and the app renders `caption ?? ''`.
2. **The feed had a SECOND responder**, hand-rolled: `interestIds` where the contract
   promises `interests`, and no media. A generated client crashes on `post.interests.map`.
   Both now go through `PostQueryService.responseFor` - one responder, the same argument as
   one `VisibilityFilter` applied to the shape rather than the decision.
3. **Video transcode failed on any clip under a second.** `-ss 00:00:01` seeks past the end,
   ffmpeg writes nothing, the post sits at `failed` forever - visible only to its author.
   Now uses the `thumbnail` filter.
4. **`posterUrl` was never sent** and appears nowhere in the API source, so FR-009's
   thumbnail reached no client. The raw media record went out instead, leaking `originalKey`,
   the path of the PRE-STRIP upload.
5. **A recipient replying did not accept the conversation**, so the initiator was refused
   with "wait for a reply" - to a reply they already had. Twelve tests written directly
   against the request rules missed it; an ordinary three-message conversation in a FEED test
   caught it.
6. **Four integration tests waited for a duration, not a condition.** Red in CI, green
   locally, twice - the second time because I patched the assertion that was red instead of
   reading the job. `apps/workers/src/interest-jobs/handler.ts` runs mark-merging, move
   posts, move followers, THEN setMergedInto, so the 301 is the completion signal.

### Guards added, each because I made the mistake first

- **`tests/integration/auth-surface.spec.ts`** enumerates EVERY route and compares the public
  set to a snapshot. Inserting a method above an existing `@Get` moves the `@Public()`
  decorator above it onto the NEW method - a write becomes public, the read starts 401ing,
  and typecheck and lint stay clean. **I did this twice.** The first guard was a hand-picked
  list and missed the second occurrence; a hand-picked list only covers mistakes you have
  already made.
- **`__tests__/hooks-before-return.test.ts`** fails the build for a hook declared after ANY
  return in a container. A hook after the final return is dead code (the save button did
  nothing); a hook after an EARLY return is "Rendered more hooks than during the previous
  render". Its own first version was too weak in exactly the way I had just been wrong about.
- **`tests/unit/feed-does-not-read-place-follows.spec.ts`** fails if `FeedService` so much as
  imports `PlaceFollowRepository`. SC-006 catches a widened feed behaviourally, but only once
  the code exists AND a post exercises it; this fails when the dependency appears.
- **`tests/unit/interest-job-order.spec.ts`** pins the merge job's step order, because an
  integration test now depends on it.
- **`apps/e2e/support/eventually.ts`** has `consistently` for negative assertions. "Zero
  notifications" checked once against an asynchronous pipeline passes before anything could
  have arrived: green, worthless, indistinguishable from a real pass.

### Design decisions worth not re-litigating

- **A Place is to a Post what an Interest is, MINUS feed membership.** Modelling a restaurant
  as a sub-interest violates Principle I by construction: 001/FR-024 rolls sub-interest posts
  into the parent, so every restaurant post lands in "Food" worldwide. FR-019 + SC-006 carry
  the negative-test shape across. **Still binding after 007**, and now the ONLY place that
  shape lives: 001/FR-033 was withdrawn, so `feed-does-not-read-place-follows.spec.ts` is
  what remains — widened by 007 to cover `RankingService` and `CandidateSource`, because
  the selection path moved out of `feed.service.ts` and the old guard would have read a
  file the violation no longer had to live in.
- **Chat is HTTP long-poll**, resolved through the durable event bus. Measured: one process
  held **200 concurrent polls, delivery p95 51ms**. That is a fact about one Node process and
  NOT about hosted chat - registered as divergence `D-004-1`.
- **Conversation ids are derived from the sorted participant pair**, so opening one is
  idempotent with no uniqueness item and no race. Group chat is out of scope because it is a
  rewrite of that, not an extra field.
- **Block severance is COMPUTED, not stored.** FR-006 says unblocking restores the prior
  state, and a stored `severed` has destroyed what that was.
- **Notification preferences were ALREADY implemented.** I claimed they were not, in the
  spec, the plan, the task list and CLAUDE.md, because I grepped `notificationPreferences`
  and the code says `notificationPrefs`. **Grep for the identifier the code would use, not
  the one the requirement is worded with.**

## Spec-kit workflow

Order: `constitution → specify → clarify → plan → tasks → analyze → implement`.

**Skills are hyphenated, not dotted.** The upstream docs say `/speckit.specify`; the
Claude Code integration installs `/speckit-specify` (skill names can't contain dots).
Typing the dotted form finds nothing.

After a spec-kit command changes an artifact, re-check the others for drift — `plan.md`'s
Constitution Check in particular goes stale when the constitution changes.

## What spec 002 established (2026-09-05)

Feature 001 was complete and green and the product did not work. Five defects,
none visible to any test that existed, all found the moment `apps/e2e` drove the
app's own data layer over HTTP against a running API:

**Deferred, not met** (decision 2026-09-05): `002/SC-002` (10,000 concurrent) and the
five real-usage criteria. Both need spend; neither is evidence of a defect. Report
them as *unverified* and *unmeasured*, never as met.

1. **The contract and the API disagreed about publishing.** OpenAPI said
   `uploadIds: string[]`; the server wanted `uploads: [{uploadId, key, kind}]`.
   Any client generated from the contract 400s on every publish.
2. **The server trusted a client-supplied media key**, so a post could point at
   another person's media. Uploads are now persisted and the server derives key
   and kind from its own record.
3. **`ApiClient` sent no token on optional-auth endpoints**, so a signed-in
   person was anonymous on `GET /posts/{id}` and was told "not available to you"
   about their own post.
4. **Nothing subscribed to `post.created`.** A published post stayed `pending`
   forever, and a pending post is visible only to its author — so nobody could
   ever see anyone else's post. 001's suites hid it by calling `reconcile()` by
   hand. `MediaDispatchService` fixes it; `MEDIA_DISPATCH_ON_CREATE=false` in the
   integration harness, which drives states deterministically.
5. **`interestFollowCount` was never incremented** — every profile said 0.

The lesson worth keeping: **both sides generated from one document agree with
each other by construction.** Contract tests and a generated client cannot catch
any of the above. Only a request can. `pnpm --filter @sih/e2e test` is that
request; do not let it become a suite that drives the generated client instead of
`apps/mobile/src/data`.

Two more of the same shape, found earlier in the same session: `pnpm lint`
resolved to a global eslint binary and had never actually run, and an
integration test passed on timing luck because its uniqueness suffix was
near-duplicate by construction.

**Run the real CI step list before pushing**, not a proxy for it. Two red builds
came from checking typecheck/lint/tests and assuming that covered CI.

## If you are asked to parallelise the build

Measured from `tasks.md`, not guessed:

- **`apps/api` holds 119 of 172 tasks.** Phases 1–2 (T001–T048) are a serial foundation.
  This project does **not** decompose into wide independent threads, and multi-agent work
  costs roughly 15× the tokens. Parallelise Waves 2–3 only.
- **T044–T048 (the visibility choke point) gate everything.** No read path may be written
  before the filter exists.
- **Single-owner files** — two agents editing these will overwrite each other:

  | File | Tasks | Phases |
  |---|---|---|
  | `apps/api/tests/visibility/matrix.spec.ts` | 6 | 2,3,4,5,7,9 |
  | `interests/interest.controller.ts` | 5 | 4,5 |
  | `posts/post.controller.ts` | 4 | 3,8 |
  | `posts/post.service.ts` | 3 | 3,8 |
  | `feed/feed.service.ts` | 2 | 5,6 |

- **US4 depends on US3** — the only genuine cross-story dependency (FR-033 needed the
  interest-follow feed to exist first). Historical: 001/US4 and FR-033 are withdrawn by 007.
- **Single-owner files for spec 002** — same rule, different set:

  | File | Why |
  |---|---|
  | `apps/e2e/support/client.ts` | The one place the journeys bind to the mobile data layer |
  | `apps/api/bench/harness.ts` | Shared by both benches |
  | `docs/verification/divergence-register.md` | `verify:register` checks it; two writers will disagree |
  | `.github/workflows/ci.yml` | Every phase wants to add a step |

  **`apps/mobile/src/screens/index.tsx` is no longer one of them** (2026-09-11). It held
  all 25 containers in 2,726 lines; they are one file each beside it now and it is a
  barrel. Two agents touching different screens no longer collide.

- Lanes that are genuinely independent after Phase 2: `apps/api`, `apps/mobile`
  (once T018 generates the client), `apps/workers`, `infra`.
- Sizing per Anthropic's guidance: **3–5 agents, 5–6 tasks each**, `isolation: "worktree"`.
- Agent Teams needs an interactive session and a terminal agent panel — **not usable in
  the cloud web environment**. Use subagents or the Workflow tool here.
- Guard stalls with the `TeammateIdle` hook (exit 2 keeps a teammate working) and
  `TaskCompleted` (exit 2 blocks a bogus completion). Documented failure modes: task
  status lagging, and agents stopping early on errors instead of recovering.

## Conventions

- Branch: `claude/spec-kit-integration-juhrza`. Commit and push; nothing else persists.
- `.specify/feature.json` is gitignored machine-local state — do not commit it.
- Never Read a subagent's `.output` file: it symlinks the full transcript and will
  overflow context.
