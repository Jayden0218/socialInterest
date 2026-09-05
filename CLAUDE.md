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

**AWS names in `plan.md` are a deferred placeholder, not a commitment.** ECS Fargate,
MediaConvert, CloudFront, Cognito are what the adapters target; no deploy decision has
been made.

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
  **Measured 2026-09-05**: fine at rest (p95 343ms at the 200-follow cap) but
  **over budget under concurrency** (p95 11.8s at 100 concurrent, budget 2s) on
  DynamoDB Local. **Do not cite that figure as evidence about the design.** The
  harness calls `feed.homeFeed()` in-process, issues its concurrency as
  `Promise.all` from one Node event loop, and hits single-process DynamoDB Local
  — so it exercises no HTTP layer and cannot distinguish the architecture from
  the emulator. Spec 002 (R1) reworks it over HTTP and adds `bench:ceiling` to
  attribute the bottleneck first. The read-time fan-in coupling is real
  arithmetic; whether it is the *observed* ceiling is not yet established.
  If it turns out to be, the answer is the **hybrid** in D1 — materialise the
  high-volume interests only, holding candidate references with
  `VisibilityFilter` still running at read time — **not** full
  fan-out-on-write, which FR-017 and SC-009 still forbid.
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

**Two limits nothing fixes**: no public inbound route (a React Native client on a phone
or simulator cannot reach an API running here), and the container is ephemeral. Build and
test the backend here; do not try to host one.

### Known dead ends — already tried, don't repeat

| Attempt | Result |
|---|---|
| `dynalite` (pure-JS DynamoDB) | **No `TransactWriteItems`** — the exact op FR-017 needs. Unusable. |
| DynamoDB Local from `d1ni2b6xgvw0s0.cloudfront.net` | 403, egress policy. Use `s3.us-west-2.amazonaws.com/dynamodb-local/dynamodb_local_latest.tar.gz` |
| `apt-get install ffmpeg` | Fails, Debian repos blocked. Use the `linuxserver/ffmpeg` container |
| MinIO binary from `dl.min.io` | 403. Use the `minio/minio` image |
| `quay.io` | Unreachable. `public.ecr.aws`, `ghcr.io`, `mirror.gcr.io` all work |

## Spec-kit workflow

Order: `constitution → specify → clarify → plan → tasks → analyze → implement`.

**Skills are hyphenated, not dotted.** The upstream docs say `/speckit.specify`; the
Claude Code integration installs `/speckit-specify` (skill names can't contain dots).
Typing the dotted form finds nothing.

After a spec-kit command changes an artifact, re-check the others for drift — `plan.md`'s
Constitution Check in particular goes stale when the constitution changes.

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
