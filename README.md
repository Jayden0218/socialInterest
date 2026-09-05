# socialInterest

An interest-centred media sharing app. People upload photos and short video, file
every post under an interest, and browse and follow **by interest** rather than by
a friend graph.

Built spec-first with [spec-kit](https://github.com/github/spec-kit). The design
documents in `specs/001-interest-media-sharing/` are authoritative — read them
before changing behaviour.

| Document | What it settles |
|---|---|
| [`.specify/memory/constitution.md`](.specify/memory/constitution.md) | **Binding rules.** Five principles, two non-negotiable |
| [`spec.md`](specs/001-interest-media-sharing/spec.md) | 49 requirements, 12 success criteria, 6 user stories |
| [`plan.md`](specs/001-interest-media-sharing/plan.md) | Stack, structure, cost posture |
| [`research.md`](specs/001-interest-media-sharing/research.md) | 9 decisions **with the alternatives already weighed** |
| [`data-model.md`](specs/001-interest-media-sharing/data-model.md) | Single-table design, 20 access patterns |
| [`contracts/`](specs/001-interest-media-sharing/contracts/) | OpenAPI, and the visibility matrix contract |
| [`tasks.md`](specs/001-interest-media-sharing/tasks.md) | 172 tasks |

`CLAUDE.md` carries the working knowledge — environment gotchas, known dead ends,
and decisions that look wrong but aren't.

## Running it

**Nothing here costs money.** Everything runs locally in Docker with no AWS
account and no credentials. See `plan.md` § Cost Posture.

```bash
pnpm install
cp .env.example .env.local
docker compose up -d                        # DynamoDB Local :8000, MinIO :9000

pnpm --filter @sih/infra db:create-local     # single table + 4 GSIs
pnpm --filter @sih/infra s3:create-local     # media bucket
pnpm --filter @sih/infra seed:catalogue      # top-level interests — NOT optional
pnpm --filter @sih/infra verify:local        # asserts the profile actually works

pnpm --filter @sih/api dev                   # API on :3000
```

The catalogue seed is required: a sub-interest can only be created beneath an
existing top-level parent (FR-022), so with an empty catalogue nothing can be
published at all.

```bash
curl localhost:3000/v1/health
# {"status":"ok","profile":"local","catalogueSize":12}
```

### Running in a cloud sandbox

Codespaces, Claude Code on the web, and similar start without a Docker daemon and
with restricted egress. Two extra steps, neither of which survives a container
reset:

```bash
mkdir -p /etc/docker
echo '{ "registry-mirrors": ["https://mirror.gcr.io"] }' > /etc/docker/daemon.json
setsid nohup dockerd > /var/log/dockerd.log 2>&1 < /dev/null &
```

`setsid nohup` matters: started with a bare `&`, the daemon is reaped with its
parent shell and every later command finds a dead socket.

Two things a cloud sandbox cannot do: it has no public inbound route, so a mobile
client cannot reach an API running there, and it is ephemeral. Build and test the
backend there; develop the app against a stack on your own machine.

## Tests

```bash
pnpm test                                    # everything
pnpm --filter @sih/api test:visibility       # SC-009 — see below
pnpm --filter @sih/api smoke:boot            # boots under the PRODUCTION runner
```

**`test:visibility` is not ordinary coverage.** It is SC-009: 294 assertions
generated from `contracts/visibility-matrix.md`, covering 7 post states × 6 viewer
relationships × 7 surfaces. A leak on any surface is a privacy failure, and it is
silent — this suite is what makes it loud.

**`smoke:boot` exists because the test suite cannot catch everything.** Jest runs
under ts-jest, which emits decorator metadata; production runs under tsx, which
does not. Reflection-based dependency injection therefore works in tests and
silently injects `undefined` at runtime. Every controller returned 500 while the
integration suite was green. This script boots the app the way production does.

## Layout

```
apps/api/        NestJS service — visibility/ is the single choke point
apps/mobile/     Expo React Native client (development builds, not Expo Go)
apps/workers/    Event-driven handlers: media, interest jobs, deletion, analytics
packages/shared/ Types, zod schemas, generated API client
infra/           Local setup scripts, and a synth-only stack description
```

## Benchmarks

```bash
pnpm --filter @sih/infra seed:load           # 100k posts, 5k interests, 10k people
pnpm --filter @sih/api bench:feed            # SC-005, BY FOLLOW COUNT
pnpm --filter @sih/api bench:feed-load       # SC-011, under load
pnpm --filter @sih/api bench:upload          # SC-002
pnpm --filter @sih/api bench:transcode       # SC-003 — ffmpeg adapter ONLY
```

`bench:feed` reports p95 broken down by follow count rather than as one number.
Research §D1 accepts that read-time feed assembly scales with how many interests
someone follows — the shape of that curve is the finding, and a healthy average
would hide a 200-follow user over budget.

`bench:transcode` measures ffmpeg, which is a *different implementation* of the
`MediaProcessor` port than MediaConvert, not an emulation of it. A green result
is not evidence the AWS path meets SC-003; see
[`docs/mediaconvert-smoke-test.md`](docs/mediaconvert-smoke-test.md).

## Deployment

There isn't one, deliberately. `infra/` describes the AWS target and validates it
against the data model, but **no task deploys anything** and doing so requires
explicit approval from the project owner. `pnpm --filter @sih/infra synth` is free
and needs no account.
