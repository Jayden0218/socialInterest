# Quickstart: validating feature 003

**Feature**: 003-device-and-hosting | **Date**: 2026-09-06

How to check each story is actually done. Every command runs in CI or in the sandbox; none
provisions anything billable.

## Prerequisites

The existing local stack, as documented in the repository guide:

```bash
# Docker daemon (does not survive a container reset)
mkdir -p /etc/docker
echo '{ "registry-mirrors": ["https://mirror.gcr.io"] }' > /etc/docker/daemon.json
setsid nohup dockerd > /var/log/dockerd.log 2>&1 < /dev/null &

docker compose up -d
pnpm --filter @sih/infra db:create-local
pnpm --filter @sih/infra s3:create-local
pnpm --filter @sih/infra seed:catalogue
```

## Story 1 — the app runs on Android

Dispatch the Android workflow, then check the artifact **whatever the outcome**:

```bash
# The run is manual: the repository is private and each run costs Actions minutes.
# Trigger android-emulator.yml on the branch, then download its artifact.
```

**Passes when** the artifact contains:

- `runtime-output.log` — the emulator's own stdout and stderr. **Required even when the run
  succeeds**, and the single thing six previous attempts never produced.
- `home.png` — a capture of the app's own interface that is **not blank**. Check it by eye; the
  only Android capture in this project's history is entirely black, which is what this exists
  to reject.
- `journeys.xml` — one result per journey, none blank.
- `api.log` — showing requests that arrived from the app.

**A failed boot with `runtime-output.log` present is a completed task**, not a failed one. It
produces the evidence FR-004 requires. A failed boot *without* it is the failure this feature
was written to stop.

## Story 2 — the stack keeps what it is given

```bash
pnpm --filter @sih/e2e test -- -t "durability"
```

**Passes when** data written before a full stack restart is readable after it, an event
published before a crash is handled after the restart, and a development-secret token is
refused. See [contracts/durability-contract.md](./contracts/durability-contract.md).

Then confirm nothing was narrowed:

```bash
pnpm --filter @sih/api test:visibility
```

**Must pass in full** — same surfaces, same states (Principle II, FR-009).

## Story 3 — the datastore decision

**Passes when** `docs/decisions/` (or `research.md`) carries a Datastore Decision record with:
each option's migration cost counted from the **14 repository classes** that would change, and
whether each option runs as itself outside a deployment. Anything less is a preference, not a
decision.

## Story 4 — media from the device library

Part of the Android journey set. **Passes when** an image placed in the emulator's library can
be selected and published, **and** refusing the permission produces an explanation rather than
an apparently broken screen (FR-012).

## Story 5 — what the datastore does under load

```bash
pnpm --filter @sih/api bench:ceiling
pnpm --filter @sih/api bench:feed-load
```

**Passes when** the report names the binding constraint *and* records what the datastore
actually was. If it was a stand-in, the result is reported as a measurement of the stand-in —
never as a statement about the product (FR-013). This is what 001 got wrong when it reported
p95 11.8s as a property of the design.

## Story 6 — the teardown check finds things

```bash
pnpm --filter @sih/infra verify:teardown
```

**Passes when** it enumerates tagged resources and reports any present — proved by giving it
one that exists. A check that reports clean by not looking is worse than no check.

## Full regression

Before any push, the real CI step list — not a proxy for it:

```bash
pnpm typecheck && pnpm lint
pnpm --filter @sih/api test
pnpm --filter @sih/mobile test
pnpm --filter @sih/workers test
pnpm --filter @sih/shared generate:client
git diff --exit-code packages/shared/src/client/operations.generated.ts
pnpm --filter @sih/e2e test
pnpm --filter @sih/api smoke:boot
pnpm --filter @sih/infra verify:stack && pnpm --filter @sih/infra synth
```

Two red builds in feature 002 came from checking a subset and assuming it covered CI.

## What passing all of this does NOT mean

- **Not device-verified.** An emulator is not a phone. Camera, real networks, vendor OS
  behaviour, battery and thermal effects stay unanswered, and Principle V still applies.
- **Not iOS.** No journey has ever run on it.
- **Not deployed.** Durable is not hosted; there is still no public address.
- **Not validated by anyone.** Nobody has used this product. Whether it is any good is outside
  this feature entirely.
