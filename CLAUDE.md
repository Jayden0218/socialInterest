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
| `specs/007-ranked-feed-redesign/` | **The current feature.** Ranked feed + redesign; Phases 1–4 done |
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

**The app runs on Android and ALL NINETEEN journeys pass** - run 37, 2026-09-08,
`19/19`, every flow on its first attempt, on the redesigned UI. Record:
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

## What spec 007 built so far (2026-09-08) — Phases 1-4, the MVP

`specs/007-ranked-feed-redesign/` replaces the composed feed with a **ranked**
one and redesigns the app. **Phases 1-4 are done and green; Phases 5-8 (the
21-task redesign, interests, publish/safety, evidence) are NOT started.**

`design/007-ui/` is the approved design (20 artboards). It is settled; Phase 5
implements it and does not reopen it.

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

### Still not verified, and must be reported that way

- **007 HAS NEVER RUN ON A DEVICE.** No emulator run since the ranked feed
  landed. The Maestro flows still describe the pre-007 feed.
- **Phases 5-8 are not started**: the redesign, the interest surfaces, the
  publish/safety pass and the evidence phase.
- 001/SC-011 (a video PLAYING), iOS, 002/SC-002, real usage, and the datastore
  decision are all unchanged and all still open.

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
