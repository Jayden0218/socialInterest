# Quickstart: Production Readiness

**Feature**: 002-production-readiness | **Date**: 2026-09-05

How to run each piece of evidence this feature produces. Phases A and B need no cloud account
and no approval. Phases C and D need both.

## Prerequisites (Phases A and B)

```bash
# Cloud sandbox only - neither step survives a container reset.
mkdir -p /etc/docker
echo '{ "registry-mirrors": ["https://mirror.gcr.io"] }' > /etc/docker/daemon.json
setsid nohup dockerd > /var/log/dockerd.log 2>&1 < /dev/null &

docker compose up -d                       # DynamoDB Local + MinIO
pnpm install --frozen-lockfile
pnpm --filter @sih/infra db:create-local
pnpm --filter @sih/infra s3:create-local
pnpm --filter @sih/infra seed:catalogue
```

---

## Phase A — the app and the service actually talk (US1)

### Tier A: automated, runs in CI

```bash
pnpm --filter @sih/e2e test
```

**Expected**: all 10 core journeys and all 4 negative journeys pass against a live API over
HTTP. See [contracts/e2e-journeys.md](./contracts/e2e-journeys.md).

**What a failure means**: the app and the service disagree. That is the point — until this
suite existed, such a disagreement could only be discovered by a person using the app.

### Contract drift check

```bash
pnpm --filter @sih/shared generate:client && git diff --exit-code packages/shared/src/client/
```

**Expected**: no diff. A diff means `contracts/openapi.yaml` and the committed client have
parted company (FR-003).

### Tier B: physical device, before any release outside the team

Cannot run in the cloud sandbox — there is **no public inbound route**, so a phone or simulator
cannot reach an API hosted here. Run on a developer machine:

```bash
pnpm --filter @sih/api dev                 # API on the LAN
pnpm --filter @sih/mobile start            # Expo dev build, device on the same network
```

Walk the core set by hand on one iOS and one Android device. Record the result as a Journey Run
in `docs/verification/runs/`. **Expected**: every journey passes on real hardware (FR-005).

---

## Phase B — what is actually saturating (US2)

Run these in order. The order matters: the third is not interpretable without the first two.

```bash
pnpm --filter @sih/infra seed:load             # seeded follows for the bench population
pnpm --filter @sih/api bench:ceiling           # generator / application / datastore ceilings
pnpm --filter @sih/api bench:feed-load         # now over HTTP, not in-process
pnpm --filter @sih/api test:visibility         # the gate - must stay at 294/294
```

**Expected from `bench:ceiling`**: three separate ceilings, so the binding one is named rather
than assumed. A `bottleneck` of `undetermined` is a permitted result and is more useful than a
confident wrong attribution.

**Expected from `bench:feed-load`**: a Load Measurement reporting `transport: http`, latency per
concurrency level, the level at which p95 first exceeds 2000 ms, and an attribution.

**Read this before citing any number**: feature 001's published figure (p95 11.8s at 100
concurrent) was measured **in-process from a single Node event loop against single-process
DynamoDB Local**. It is not comparable to anything produced here, and it does not distinguish
the design from the emulator. See [research.md](./research.md#r1).

**Gate**: `test:visibility` MUST report 294/294 with all 7 surfaces after any change made to
reach the latency budget. A performance change that reduces matrix coverage is rejected
regardless of the latency it achieves.

---

## Phase C — production-path verification (US3) — **APPROVAL REQUIRED**

**Do not run any of this without explicit, specific approval from the project owner recorded as
an Approval Record.** Approval for one verification is not approval for another.

Check the register first:

```bash
cat docs/verification/divergence-register.md
pnpm --filter @sih/infra verify:register        # fails if the register and adapters/aws/ disagree
```

Dry runs — safe, no resources created, no spend:

```bash
pnpm --filter @sih/infra synth                  # no account, no credentials
pnpm --filter @sih/infra verify:teardown --dry-run
```

Each verification, once approved, follows its runbook and ends with:

```bash
pnpm --filter @sih/infra verify:teardown --tag <run-tag>    # separate invocation, by design
pnpm --filter @sih/infra spend-report --run <run-id>
```

**Expected**: `verify:teardown` reports zero surviving resources. It is run as its own command,
not in a `finally` block, because the failure being guarded against is the creating process
dying before teardown (see [research.md](./research.md#r6)).

---

## Phase D — real-usage measurement (US4) — **APPROVAL REQUIRED**

Needs a deployment and real participants. Once a window has closed:

```bash
pnpm --filter @sih/workers report:outcomes --window <start>..<end>
```

**Expected**: one figure per criterion against its target, misses included, cells under 20
people suppressed, and `unmeasurable` where the window was too small or the data was never
recorded. See [contracts/outcome-report.md](./contracts/outcome-report.md).

---

## Full local verification (everything that needs no approval)

```bash
pnpm typecheck && pnpm lint
pnpm --filter @sih/api test
pnpm --filter @sih/mobile test
pnpm --filter @sih/e2e test
pnpm --filter @sih/api smoke:boot
pnpm --filter @sih/infra verify:local
pnpm --filter @sih/infra verify:register
pnpm --filter @sih/infra verify:stack
pnpm --filter @sih/infra synth
```

Everything above runs with no cloud account and no credentials, and is what CI runs.
