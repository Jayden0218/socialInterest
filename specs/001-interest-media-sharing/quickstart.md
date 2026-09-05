# Quickstart: Interest-Centred Media Sharing

**Feature**: `specs/001-interest-media-sharing` | **Date**: 2026-09-05

How to run the stack locally and validate that each user story in
[`spec.md`](./spec.md) actually works. This is a run-and-verify guide — implementation
belongs in `tasks.md`.

---

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | 22 LTS | API, workers, and mobile tooling |
| pnpm | 9+ | Workspace package manager |
| Docker + Compose | 24+ / v2+ | DynamoDB Local, MinIO, ffmpeg |
| AWS CLI | v2 | Convenience for poking at the local S3 and table |
| Expo CLI | via `pnpm dlx` | Mobile dev client |
| Xcode / Android Studio | current | Simulator or emulator for the mobile app |

ffmpeg is **not** required on the host — the media worker invokes it through a
container in the `local` profile, matching how MediaConvert is invoked in `aws`.

Everything below runs the `local` runtime profile ([research.md §D9](./research.md)):
MinIO for S3, ffmpeg for MediaConvert, a local JWT issuer for Cognito, and DynamoDB
Local — which needs no adapter, because it speaks the same API as the managed service.
No AWS account or credentials are needed to run or test anything in this guide.

### Running in a cloud sandbox (Claude Code on the web, Codespaces, similar)

Two extra steps, because these environments start without a Docker daemon and with a
restricted egress policy. Verified in a Claude Code cloud sandbox on 2026-09-05.

```bash
# 1. Start the daemon — dockerd/containerd/runc are installed but not running
dockerd > /var/log/dockerd.log 2>&1 &

# 2. Docker Hub's blob CDN is commonly blocked; use a mirror
mkdir -p /etc/docker
echo '{ "registry-mirrors": ["https://mirror.gcr.io"] }' > /etc/docker/daemon.json
kill $(pgrep -x dockerd); sleep 3; dockerd > /var/log/dockerd.log 2>&1 &

docker info --format '{{.RegistryConfig.Mirrors}}'   # expect [https://mirror.gcr.io/]
```

With the mirror configured, unqualified image names pull normally — no renaming in
`docker-compose.yml`. Neither step survives a container reset, so treat both as
per-session setup. `public.ecr.aws` and `ghcr.io` are reachable as fallbacks.

**Two things a cloud sandbox cannot do**, regardless of the above: it has no public
inbound route, so a React Native client on a phone or simulator cannot reach an API
running there; and the container is ephemeral. Use it to build and test the backend,
not to host one. Develop the mobile app against a stack on your own machine.

## Setup

```bash
pnpm install
cp .env.example .env.local          # RUNTIME_PROFILE=local, endpoints, table and bucket names
docker compose up -d                # DynamoDB Local :8000, MinIO :9000 (console :9001)
pnpm --filter @sih/infra db:create-local   # single table + 4 GSIs per data-model.md
pnpm --filter @sih/infra s3:create-local   # media bucket
pnpm --filter @sih/infra seed:catalogue    # top-level interests (FR-021)
```

The catalogue seed is not optional. FR-022 only permits creating sub-interests beneath
an existing top-level parent, so with an empty catalogue nothing can be published — the
Assumptions section of the spec records this as a launch prerequisite.

```bash
pnpm --filter @sih/api dev          # NestJS on :3000
pnpm --filter @sih/workers dev      # local S3/stream event pump
pnpm --filter @sih/mobile start     # Expo dev client
```

Health check: `curl localhost:3000/v1/health` → `{"status":"ok","profile":"local"}`.

Verify the profile end to end before trusting any test result:

```bash
pnpm --filter @sih/infra verify:local
```

Asserts the four things the local profile depends on: a `TransactWriteItems` across a
post and its index items (FR-017), a presigned `PUT` upload and readback (FR-004),
an ffmpeg encode producing a poster frame and HLS rendition (FR-009), and a token from
the local issuer that the API accepts.

## Test commands

```bash
pnpm test                  # everything
pnpm test:unit             # visibility filter, feed merge, near-duplicate matching
pnpm test:integration      # acceptance scenarios against DynamoDB Local
pnpm test:contract         # generated from contracts/openapi.yaml
pnpm test:visibility       # the SC-009 matrix — see below
pnpm --filter @sih/mobile test:e2e   # Maestro flows
```

### The visibility suite is not ordinary coverage

```bash
pnpm test:visibility
```

Generates 294 assertions from
[`contracts/visibility-matrix.md`](./contracts/visibility-matrix.md) — 7 post states ×
6 viewer relationships × 7 surfaces. **SC-009 is this suite.** Treat a failure here as
a release blocker rather than a test to fix later; the failure mode it guards against
is silent and privacy-affecting.

---

## Validating each user story

Each block below corresponds to a prioritised story in the spec and is independently
runnable — you can stop after any one of them and have something demonstrable.

### US1 — Publish media to an interest (P1)

```bash
pnpm --filter @sih/api test:integration -- us1-publish
```

Then by hand, in the mobile app: sign in → pick a photo → choose a sub-interest → set
visibility → publish.

**Expect**: the post appears in that interest's space within 5s and on your profile.
Publishing with no interest selected is refused (FR-006). Publishing without touching
the visibility control yields a **public** post (FR-013). A video shows upload progress
and becomes playable with a poster frame once processing completes (FR-009).

**Verify the privacy guarantee** — upload a photo with GPS EXIF, then:

```bash
pnpm --filter @sih/api verify:exif -- --post <postId>
```

Expect no location tags in any stored rendition. This must pass with a *modified client
that skips its own stripping* — FR-010 is a server-side guarantee, so testing it only
through the well-behaved app proves nothing.

### US2 — Discover content by interest (P2)

```bash
pnpm --filter @sih/api test:integration -- us2-discover
```

**Expect**: opening a sub-interest shows its posts and nothing from unrelated branches.
Opening its parent shows the sub-interest listed *and* its posts rolled up (FR-024).
Type-ahead returns matches across both levels, each sub-interest labelled with its
parent. Scrolling to the end loads older posts without losing position (FR-035).

### US3 — Follow interests (P3)

```bash
pnpm --filter @sih/api test:integration -- us3-follow-interests
```

**Expect**: the home feed contains posts only from followed interests. Following a
top-level interest picks up posts in its sub-interests (FR-028) — **including
sub-interests created after the follow**, which is the case the read-time expansion in
`data-model.md` exists to handle. Following nothing yields the onboarding empty state.

### US4 — Follow people within followed interests (P4)

```bash
pnpm --filter @sih/api test:integration -- us4-follow-people
```

This is the subtle one. Set up: person B posts to interest X *and* interest Y. Person A
follows B, and follows only X.

**Expect**: B's post in X appears in A's feed, ranked above unfollowed authors' posts in
X (FR-034). **B's post in Y does not appear at all** (FR-033). If it does, the feed has
quietly become an ordinary follower feed and the product's organising principle is gone
— this assertion is the guard against that.

### US5 — Engage and share (P5)

```bash
pnpm --filter @sih/api test:integration -- us5-engage
```

**Expect**: reacting twice does not double the count (the key structure prevents it).
A public post's share link opens signed-out with a join prompt. A followers-only post's
link shows "not available to you" to a non-follower. A deleted post's link shows "no
longer available". A blocked viewer gets "no longer available", **not** "not available
to you" — see the error-distinction table in the visibility contract for why.

### US6 — Manage profile and content (P6)

```bash
pnpm --filter @sih/api test:integration -- us6-manage
```

**Expect**: editing a caption or re-filing a post updates every surface it appeared on.
Flipping a public post to private removes it from other people's feeds, interest spaces,
and search **immediately**, and its existing share links stop resolving (FR-017,
FR-042). Deleting removes it everywhere.

---

## Validating the operational paths

### Interest merge (FR-030)

```bash
pnpm --filter @sih/api test:integration -- interest-merge
```

**Expect**: while the job runs the source interest reports `merging` and reads redirect
to the survivor; on completion, posts and followers are on the survivor and nothing is
orphaned. Re-running the job is idempotent. Retiring a top-level interest that still
has live sub-interests is refused.

### Moderation (FR-045, FR-047, SC-010)

```bash
pnpm --filter @sih/api test:integration -- moderation
```

**Expect**: reports on posts, comments, **and interest names** all file (FR-043). The
queue is oldest-first. A decision writes an audit entry that survives deletion of the
subject, and removal notifies the author.

---

## Performance checks

These map to the spec's success criteria. Run against a seeded dataset:

```bash
pnpm --filter @sih/infra seed:load -- --posts 100000 --interests 5000 --people 10000
pnpm --filter @sih/api bench:feed        # SC-005: first content within 2s p95
pnpm --filter @sih/api bench:upload      # SC-002: 95% of <10MB images within 10s
```

`bench:feed` reports p95 broken down by the number of interests the viewer follows.
Watch the curve, not just the headline number — research §D1 accepts that read-time
assembly scales with follow count, and this benchmark is where that assumption gets
checked against the 200-follow cap before it becomes a production surprise.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Posts never leave `processing` | Worker pump not running, or the ffmpeg image is not pulled | `pnpm --filter @sih/workers dev`; `docker images \| grep ffmpeg` |
| `docker: failed to copy ... Forbidden` on pull | Egress policy blocks Docker Hub's blob CDN | Configure the `mirror.gcr.io` registry mirror — see the cloud sandbox section above |
| `Cannot connect to the Docker daemon` | Daemon not started (common in cloud sandboxes) | `dockerd &` — see the cloud sandbox section above |
| Video works locally but not in staging | ffmpeg and MediaConvert are different implementations of the `MediaProcessor` port, not emulations of each other (research §D9) | Run the MediaConvert smoke test against a staging account; never infer the `aws` path from green ffmpeg tests |
| `ValidationException` on write | Table created before a `data-model.md` GSI change | `pnpm --filter @sih/infra db:recreate-local` |
| Type-ahead returns nothing | Catalogue cache empty — it loads at API boundary startup | Restart the API after seeding; check `/v1/health` reports `catalogueSize > 0` |
| Feed empty despite following people | Working as specified — FR-033 requires following the *interest* too | Follow the interest; see US4 above |
| Share link 403 where 404 expected | Block-versus-visibility distinction inverted | See the error-distinction table in `contracts/visibility-matrix.md` |
