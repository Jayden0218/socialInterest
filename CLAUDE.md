# socialInterest — agent guide

Interest-centred media sharing app. **Spec-driven**: no code exists yet; the design is
complete and authoritative. Built with [spec-kit](https://github.com/github/spec-kit).

Read before doing anything substantive:

| File | What it settles |
|---|---|
| `.specify/memory/constitution.md` | **Binding rules.** v1.0.0, 5 principles, 2 NON-NEGOTIABLE |
| `specs/001-interest-media-sharing/spec.md` | 49 FRs, 12 SCs, 6 user stories |
| `specs/001-interest-media-sharing/plan.md` | Stack, structure, cost posture |
| `specs/001-interest-media-sharing/research.md` | 9 decisions (D1–D9) **with the alternatives already weighed** |
| `specs/001-interest-media-sharing/data-model.md` | DynamoDB single-table design, 20 access patterns |
| `specs/001-interest-media-sharing/contracts/` | OpenAPI + the visibility matrix contract |
| `specs/001-interest-media-sharing/tasks.md` | 172 tasks, T001–T172, ordered |

Do not re-litigate a decision in `research.md` without reading why it was made. Several
look arbitrary and are not — see "Decisions that look wrong but aren't" below.

## Hard rules

**Cost — the owner's standing instruction.** No task may provision billable cloud
resources without explicit, specific approval. Approval for one deploy is not approval
for the next. Everything runs on the `local` profile: DynamoDB Local, MinIO, ffmpeg, a
local JWT issuer, all in Docker, no AWS account. IaC may be written and `cdk synth`'d
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

Consequence worth naming: there is no production hosting story now. DynamoDB Local
is a dev tool, not a production datastore, and `infra/` still describes an AWS stack
that nothing targets. Both are open questions, not settled ones.

**Constitution, in brief** (read the file for the binding text):

1. *Interest Is the Organising Principle* (NON-NEGOTIABLE) — a person-follow must never
   widen a feed beyond followed interests (FR-033).
2. *Visibility Is Decided Once* (NON-NEGOTIABLE) — one `VisibilityFilter`; every read
   path goes through it; every surface enumerated in the matrix contract.
3. *Privacy Guarantees Are Enforced Server-Side* — and tested via the path a hostile
   client would take, not the well-behaved one.
4. *Safety Ships With the Product* — reporting/blocking/moderation is a release gate,
   not polish. US1–US6 alone must not ship publicly.
5. *Emulation Is Not Evidence* — a green local suite against a different implementation
   is not proof the production path works.

## Decisions that look wrong but aren't

- **Read-time feed assembly, not fan-out-on-write** (D1). Forced by FR-017 + SC-009: a
  visibility flip must land everywhere immediately, which materialised timelines cannot
  guarantee. Do not "optimise" this into precomputed timelines.
  **Measured 2026-09-05, attributed (spec 002 R1)**: the ceiling is
  **DynamoDB Local**, not the design. `bench:ceiling` measured the three limits
  apart — generator 187,439 req/s, **emulator 827 req/s**, application shape with
  a stubbed datastore 5,574 req/s. **Re-measured 2026-09-06 against the durable
  (disk-backed) stack**: generator 356,276, **datastore 882**, application 9,475.
  The datastore is still the lowest ceiling by an order of magnitude, so the
  conclusion is unchanged and neither figure says anything about D1. `bench:feed-load`, now driven over HTTP, shows
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
- **DynamoDB has no adapter; every other managed service does** (D9). DynamoDB Local
  speaks the same API, so no abstraction is warranted. Don't add one.
- **PostgreSQL is genuinely the better fit for this spec** (D3) and was not chosen —
  DynamoDB is the owner's instruction. The friction (fuzzy interest search, merges,
  aggregation) is deliberately concentrated behind `CatalogueSearch` and one async job.
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

Verified working: `docker compose` with DynamoDB Local + MinIO, presigned S3 upload,
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

**The tunnel still does not work, and not for the reason you would guess.** There are
two enforcement layers: through the agent proxy `api.trycloudflare.com` answers 200,
but a direct connection returns `403 x-deny-reason: host_not_allowed`. cloudflared's
edge link is raw TCP/QUIC rather than an HTTP request, so it cannot use the proxy,
goes direct, and is denied. Allowlisting the host does not fix it. A tunnel agent that
honours `HTTPS_PROXY` for its transport (ngrok is the candidate) might.

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
| `quay.io` | Unreachable. `public.ecr.aws`, `ghcr.io`, `mirror.gcr.io` all work |
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
- **A signed token is not an identity.** The local profile has no signup
  endpoint, so a correctly signed JWT whose profile row does not exist gets
  `404 No such person` from `GET /v1/me` and sign-in fails on the device.
  `apps/api/scripts/mint-device-token.ts` writes the row through the API's own
  `PersonRepository`, the same thing `apps/e2e/support/people.ts` does.

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

**The app runs on Android and all ten journeys pass.** Run 25, 2026-09-06:
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

**Still not verified:** J-05 (no video fixture) and J-10 (a block hides content
from later flows in the same suite; covered over HTTP by N-03) are recorded
`not run`. An image chosen from a POPULATED gallery is not covered - flow 10
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

## The Actions allowance is exhausted (2026-09-06)

Every workflow on this repository now fails ~6 seconds after being created, with no step run:

```
The job was not started because recent account payments have failed or your
spending limit needs to be increased.
```

This blocks **ordinary CI too**, not just the emulator job. It is an account limit, not a
code failure, and nothing in this repository can change it. Do not keep dispatching runs to
see whether it has cleared — check the billing page, or wait for the monthly reset.

Consequence for anyone reading the Android records: everything pushed after run 16
(`17e1008`) is **unverified**. It is reasoned from captured evidence and passes every local
check, and no run has executed it.

## What spec 004 built and established (2026-09-07)

`specs/004-chat-places-and-depth/` is **implemented**: 128 of 140 tasks, five stories -
conversations, places, interest depth, the shipped-scope holes, saved posts. Record:
`docs/verification/runs/2026-09-07-feature-004-local-record.md`.

**SC-005 is closed**: the visibility matrix runs **462 assertions with zero skipped**, across
11 surfaces, and `surface-routing.spec.ts` proves each one CONSULTS the filter. The matrix
alone never could - every row runs the same `decide()`, so 462 assertions would otherwise
mean one function tested 66 times.

**Not verified, and must be reported that way**: nothing in 004 has run on Android. Seven
Maestro flows are written and their selectors checked; none has executed. **001/SC-011 - a
video PLAYING on a device - is still unverified**, and FR-005/FR-009 have now been claimed
without a run behind them twice.

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
  FR-033's negative-test shape across.
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

- **US4 depends on US3** — the only genuine cross-story dependency (FR-033 needs the
  interest-follow feed to exist first). Same agent, sequential.
- **Single-owner files for spec 002** — same rule, different set:

  | File | Why |
  |---|---|
  | `apps/e2e/support/client.ts` | The one place the journeys bind to the mobile data layer |
  | `apps/api/bench/harness.ts` | Shared by both benches |
  | `apps/mobile/src/screens/index.tsx` | Every container lives here |
  | `docs/verification/divergence-register.md` | `verify:register` checks it; two writers will disagree |
  | `.github/workflows/ci.yml` | Every phase wants to add a step |

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
