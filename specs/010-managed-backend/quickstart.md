# Quickstart: proving 010 works

**Feature**: 010 | **Date**: 2026-09-13 | **Plan**: [plan.md](./plan.md)

How to validate each phase, and what each step proves. Two criteria take **seven days** and
cannot be hurried — that is stated rather than worked around.

---

## Phase A — the datastore, locally

Nothing here needs an account. That is deliberate: the constitution requires the whole suite to
run without cloud credentials, and it is also how the migration gets proven before anything is
deployed.

```bash
docker compose up -d            # Postgres, not DynamoDB Local
pnpm --filter @sih/infra db:create-local
pnpm --filter @sih/infra seed:catalogue
```

Then the gate, which is the whole of Phase A's verification:

```bash
pnpm --filter @sih/api test     # unit, contract, visibility, integration
pnpm lint && pnpm typecheck
```

| Expect | Proves |
|---|---|
| **16 surfaces, 1,488 assertions**, unchanged | FR-006 — no visibility answer moved |
| Public and operator route snapshots unchanged | Principle III |
| Every existing suite green, for the same reasons | FR-003 — the access patterns survived |
| The primitives' own tests green, **each watched red first** | The contract |

> **If a visibility number moved, stop.** The correct response is to find out why. Updating the
> number to match is how a migration ships a behaviour change disguised as a passing suite.

Then the thing the suite cannot tell you:

```bash
docker compose down && docker compose up -d
```

Publish a post first, restart, and read it back. **That is FR-001**, and no unit test can stand
in for it.

---

## Phase B — media

```bash
# with the managed storage credentials in the environment, never in a file
pnpm --filter @sih/api dev
```

Publish a post carrying a photograph. Restart everything. The photograph still renders.

| Expect | Proves |
|---|---|
| It renders after a restart | FR-008 |
| Its address stops working after the expiry | FR-009 |
| A viewer who may not see the post cannot fetch the file | FR-009, Principle II |

> **Phase B's premise is that the adapter needs no code change** — Supabase Storage speaks S3
> and signs with SigV4, exactly as MinIO does. This step is where "probably" becomes "observed".
> If path-style addressing or signing differs, it is a small change in one file — but it is a
> change, and it is found here rather than in production.

---

## Phase C — media processing with no container runtime

```bash
docker run --rm <the-api-image> ffmpeg -version
```

Then publish a **video** and confirm its poster frame appears — with no Docker socket available
to the API.

> `-ss 00:00:01` seeks past the end of any clip shorter than a second, ffmpeg writes nothing,
> and the post sits at `failed` forever, visible only to its author. The `thumbnail` filter
> exists for that reason. **Test with a short clip**, because that is the one that broke before.

---

## Phase D — deployed

Point the app at the deployed address. Then:

| Step | Expect | Proves |
|---|---|---|
| Sign in, publish a post with a photograph | It works | The path end to end |
| Time it | **Under 30 seconds** | SC-007 |
| Leave it a day, open the app | First request **under 60 seconds** | SC-008 |
| **Wait seven days.** Open the app | The post and its photograph are there | **SC-001** |
| Same seven days, address never retyped | It still reaches the product | **SC-005** |

> **SC-001 and SC-005 cannot be rushed.** "It persists" is not observable in an afternoon, and a
> criterion that resists being ticked early is doing its job. Report them `not run` until the
> seven days have actually passed.

---

## What must still be true afterwards

```bash
pnpm --filter @sih/api test:visibility    # 16 surfaces, 1,488 assertions
pnpm --filter @sih/api test:integration   # route snapshots
pnpm verify:register                      # the divergence entry exists
```

And by inspection, **SC-004**: no payment method on file with any provider. If one is needed at
any point, this feature failed its binding requirement rather than made a trade-off.

---

## Recording it

A dated record in `docs/verification/runs/`, every criterion marked pass, fail or **not run** —
never blank, and **count the items rather than reading the highest number**, which this project
has got wrong twice.

The divergence-register entry is required by the plan's Principle V gate. Local Postgres and the
managed one are the same software — much better evidence than DynamoDB Local ever gave — and
still not the same environment. Record what differs: pooling, latency, and the free tier's
ceilings.
