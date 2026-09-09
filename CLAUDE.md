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
| `specs/007-ranked-feed-redesign/` | **The current feature.** Ranked feed + redesign; all 8 phases implemented |
| `design/007-ui/` | The **approved** design, 20 artboards. Settled — implement, do not reopen |

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

## The Actions allowance was exhausted, and is not any more (cleared 2026-09-07)

On 2026-09-06 every workflow failed ~6 seconds in with `recent account payments have
failed or your spending limit needs to be increased`, blocking ordinary CI as well as the
emulator job.

**That is over.** The repository is **public** (`visibility: public`, checked 2026-09-07),
so GitHub-hosted standard runners are free on it, and CI runs 169-176 plus emulator runs
26-29 all executed normally. The cost rule in `plan.md` is a rule about SPEND, and a run
on this repository does not spend - so dispatching the emulator job is not the owner's
call any more. Check the facts before repeating either claim; both halves of this one
expired within a day.

## What spec 008 Phases A and B built (2026-09-09)

`specs/008-post-reach-and-depth/` is **a complete-app scope**: 15 stories, 54 FRs, 17 SCs,
in five release phases. **All five phases are implemented and every local gate is green.**
The device runs are recorded separately and are the thing to check before believing any of
it — see "Still not verified for 008" at the end of this section.

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

### Still not verified for 008, and must be reported that way
- **Native font scaling.** `safety-fit.spec.ts` measures layout at 130% text in a browser and
  says so; react-native-web ignores the platform font setting entirely, which is why 006's
  `Avatar` overflow was invisible there. **A browser result does not close SC-017.** Every
  control the feature added is covered on the SCREEN-SIZE half only, and that has been the
  position since 006.
- **A mention link's tap on a device**, above.
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
