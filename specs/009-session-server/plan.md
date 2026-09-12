# Implementation Plan: Disposable Session Server

**Branch**: `claude/pensive-goldberg-jjjni5` | **Date**: 2026-09-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-session-server/spec.md`

**Constitution**: **2.0.0** (amended 2026-09-08). The section this plan turns on is not a
principle but **Cost and Environment Constraints** — the feature exists because of it, and
FR-009 is that paragraph restated as a requirement. Principles II, III and V are engaged
**negatively**: this feature must change nothing they govern, and the gates below are
written to fail if it does.

## Summary

Two independent pieces of work, and reading the build changed the size of one of them.

**US1 is bigger than the spec makes it look, and the extra part is a pre-existing defect.**
The plan was to store the backend address through the existing `KeyValueStore` seam. That
seam has exactly **one implementation** — `browserKeyValueStore()`, which returns `null`
off the web. So on a device `defaultTokenStore()` returns `undefined`, the token store falls
back to memory, and **the app signs out on every relaunch**. `data-provider.tsx` says so in
its own comment and calls it "a real remaining gap, recorded rather than hidden". It is the
declared-half-with-no-other-half shape this project has now found seven times: a persistence
interface, a web half, and no device half.

FR-002 ("a set address survives closing and reopening the app") cannot be met without
building that half. So US1 delivers a device key/value store, and the token persistence bug
is fixed on the way past — not as scope creep, but because the address and the token are the
same storage problem and fixing one without the other would be the eighth instance.

**US2 is mostly assembly, not construction.** `.github/workflows/android-emulator.yml`
already brings this exact stack up on a runner: per-run secret, `docker compose up -d` with
a readiness wait, the three seed scripts, `S3_PUBLIC_ENDPOINT` wiring, API start. US2 swaps
that workflow's host-loopback addressing for two tunnel addresses and holds the job open. No
server code changes. No data model changes. No new API route.

**The one decision that governs the rest** is the order things start in. The API bakes the
media address into every presigned URL it issues, and a signature covers the host — so the
media address must exist **before the API starts**, not after. Get that backwards and you
get a working app with blank images, which reads as a product defect and is not one. This
project has already paid for that lesson twice (run 13, run 25/defect 3). It is written down
as a contract here rather than as a comment in a YAML file.

**What this feature does not do** is answer the hosting question. A six-hour tunnelled
runner is a development convenience. `CLAUDE.md`'s "no production hosting story" line and
`003/datastore-decision.md` stay open, and the spec's Out of Scope says so in writing.

## Technical Context

**Language/Version**: TypeScript 5.9, Node 22. Workflow YAML and bash for the session side.

**Primary Dependencies**: Unchanged on the server — NestJS 11, `@aws-sdk/*` against DynamoDB
Local, MinIO, ffmpeg. **One new mobile dependency**: a device key/value store
(`@react-native-async-storage/async-storage`, research R4). **One new build-time tool**:
`cloudflared`, used only inside the workflow and never shipped in the app.

**Storage**: **No change.** No new item type, no new GSI, no migration. The only new
persisted state is two keys on the device (see [data-model.md](./data-model.md)).

**Testing**: jest — `@sih/mobile` (the store, the container, the guards), `@sih/api`
(unchanged suites must stay green and the visibility totals must not move), `@sih/e2e`
(`browser/signin-fit.spec.ts` measures the sign-in fold). The session workflow itself is
verified by **dispatching it**, because nothing else can: see Principle V below.

**Target Platform**: Android, on **the owner's own phone** — which is new. Every device run
to date has been an emulator sharing a machine with the API.

**Project Type**: Mobile app + existing API, plus one CI workflow. No new deployable.

**Performance Goals**: None numeric beyond the spec's SCs. A session is used by one person;
throughput is not a concern and no benchmark is warranted.

**Constraints**: **Zero cost and zero payment methods** (FR-009) — this is the binding
constraint, not a preference. A GitHub-hosted job is capped at **6 hours** and the cap is
hard, so session lifetime has a ceiling that is not ours to raise.

**Scale/Scope**: One owner, one phone, one session at a time. Two files of new mobile code,
one workflow, one script, one contract pair.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — result at the
bottom of this section.*

### I. Interest Is the Unit of Meaning (NON-NEGOTIABLE) — **not engaged**

Recorded rather than omitted, per the compliance rule. This feature adds no post, no
interest, no feed, and no follow behaviour. Nothing reads or writes a ranking signal.

### II. Visibility Is Decided Once (NON-NEGOTIABLE) — **engaged, negatively**

A session is the same product at a different address. It introduces **no surface**, so the
matrix must not grow.

> **Gate**: `matrix.spec.ts` still asserts `BASE_SURFACES.length === 16` and a `baseTotal` of
> **1,488**, unchanged. `surface-routing.spec.ts` unchanged. If either moves, this feature has
> added a visibility surface and the design is wrong.

FR-007 is the client half of the same rule: the backend address is a *destination*, not a
permission. A person who types a different address gets a different server's answers — they
do not get more of this one's. Nothing in the app may read the address to decide what to
show.

### III. Privacy Guarantees Are Enforced Server-Side — **engaged**

A session is reachable from the public internet, which is the first time that has been true
of this product. That raises the stakes on server-side enforcement but changes none of it.

> **Gate**: `auth-surface.spec.ts`'s public-route snapshot is **unchanged**. No route becomes
> `@Public()` to make a session easier to use. `LOCAL_JWT_SECRET` is generated per session
> and never stored in the repository — `configuration.ts` already refuses the published dev
> value, and that refusal must stay reachable.

### IV. Safety Ships With the Product — **engaged, and this one needs an argument**

The principle says the safety features are a release gate and that the product must not ship
publicly without them. A session **is** publicly addressable, so the question is fair.

The answer has two halves. First, a session runs the **whole** product — reporting,
blocking, muting, moderation notices and appeals all shipped in 008 and are present in every
session, so the gate's substance is met rather than dodged. Second, a session is not a
release: it is not advertised, not indexed, lasts hours, and requires a credential that only
the owner can issue. FR-019 makes the "not a deployment" framing a requirement so that a
later reader cannot mistake one for the other.

> **Gate**: no session may run a build with safety surfaces disabled, and no document
> produced by this feature may describe a session as a deployment or as available to the
> public.

### V. Emulation Is Not Evidence — **engaged, and it constrains how this gets reported**

Two distinct claims here, and both are easy to overstate.

1. **A session is a second environment.** The same code, reached by a different route, with
   a tunnel in the path that can impose its own limits. It gets a divergence-register entry.
   What passes in a session is evidence about a session.
2. **The tunnel is unverified.** `CLAUDE.md` records quick tunnels failing *in this sandbox*
   — an egress-allowlist fact about this environment, not about GitHub's runners. I expect
   them to work on a runner. **I have not observed it**, and R2 records it as unverified with
   named fallbacks rather than as a solved problem. The first dispatch is the experiment.

> **Gate**: no document may state that the session server works until a dispatched run has
> been observed end to end. "It should work" is not a result.

### Cost and Environment Constraints — **engaged; this is the feature's reason for existing**

The owner asked for free with no payment method anywhere. FR-009 is binding: a design that
needs an account with a card is a design that has failed this feature, not a trade-off.

> **Gate**: provisioning nothing. No cloud account, no payment method, no billable resource,
> and no credential the owner does not already hold. The repository is public, so
> GitHub-hosted runners cost nothing on it — a fact `CLAUDE.md` records as checked, and which
> the first dispatch re-checks for free.

The paragraph's other clause is satisfied more strongly than usual: a session *is* the local
runtime profile, unchanged, running somewhere else. Nothing about it is a managed service.

### Development Workflow and Quality Gates — **engaged**

- *Specification precedes implementation* — spec committed before this plan. ✅
- *Ambiguity is resolved, not guessed* — four defaults recorded in the spec's Assumptions;
  the one that was actually put to the owner (session lifetime) is marked as answered by
  default in the absence of a reply, so the guess is visible. ✅
- *Tests that define a contract are written first* — both contracts in `contracts/` get their
  enforcing test before the code they govern. ✅
- *Success criteria are measured, not asserted* — every SC needs a measuring task in
  `tasks.md`. SC-003 and SC-004 can only be measured on the phone, and SC-007 is measured by
  inspection (no payment method on file). ✅
- *Honest reporting* — R2's unverified status, and the device-token persistence bug being a
  pre-existing defect rather than something this feature introduced. ✅

### Gate baselines, measured before any code changed (T004, 2026-09-12)

| Gate | Baseline | Command |
|---|---|---|
| Visibility | **1522 tests, 3 suites, all passing**; `BASE_SURFACES.length === 16`, `baseTotal === 1488` | `pnpm --filter @sih/api test:visibility` |
| Public/operator route snapshot | **5 tests passing**, including *exactly these routes are public — no more, no fewer* | `pnpm --filter @sih/api test:integration -- auth-surface` |

Recorded here rather than in `quickstart.md`, which is a guide for the owner and not a place
to keep measurements (analyze finding U2).

### Post-design re-check

Re-evaluated after Phase 1. **No principle is violated and the Complexity Tracking table is
empty.** Two things were checked specifically because they looked like violations and are
not:

- **Is a runtime-selectable backend address "a second implementation selected by config"** —
  the shape the four AWS adapters were deleted for? **No.** That rule is about two
  implementations of one port inside this repository, only one of which any test exercises.
  Here there is one implementation of everything; only the address changes, and the thing at
  the other end is this same product. Nothing new goes untested.
- **Does adding a device key/value store widen the app's trust surface?** No. It stores what
  is already stored on web — a credential and now an address — through the same interface,
  and `PersistentTokenStore` already treats a storage failure as "signed out" rather than
  throwing.

## Project Structure

### Documentation (this feature)

```text
specs/009-session-server/
├── plan.md                          # This file
├── spec.md
├── research.md                      # Phase 0 — R1..R10
├── data-model.md                    # Phase 1 — device keys; NO server model change
├── quickstart.md                    # Phase 1 — how to prove it works
├── contracts/
│   ├── session-descriptor.md        # What a session must hand back (FR-020..022)
│   └── backend-address.md           # Device-side precedence, persistence, invalidation
├── checklists/
│   └── requirements.md
└── tasks.md                         # Phase 2 — /speckit-tasks, not created here
```

### Source code (repository root)

```text
apps/mobile/src/
├── data/
│   ├── token-store.ts               # KeyValueStore lives here; gains a device backing store
│   └── settings-store.ts            # NEW — the backend address, same interface, second key
├── data-provider.tsx                # Chooses the backing store; currently web-only
├── App.tsx                          # baseUrl becomes loaded state, not a module constant
├── config.ts                        # Keeps the built-in default; unchanged in shape
├── features/auth/SignInScreen.tsx   # Gains the address field; keeps the keyboard invariant
└── screens/SignInContainer.tsx      # Wires address + credential; hooks-before-return applies

apps/e2e/browser/
└── signin-fit.spec.ts               # Measures the sign-in fold with two fields

.github/workflows/
└── session-server.yml               # NEW — workflow_dispatch; the session

scripts/
└── session-up.sh                    # NEW — the ordered bring-up, so the YAML stays thin

docs/verification/
└── divergence-register.md           # Principle V entry for the session environment
```

**Structure Decision**: No new package and no new deployable. The mobile change lives beside
the seam it extends (`apps/mobile/src/data/`), and the session lives in the two places this
repository already keeps runnable infrastructure — a workflow in `.github/workflows/` and the
script it calls in `scripts/`, matching `android-device-pass.sh` and `emulator-launch.sh`.

**The bring-up logic goes in `scripts/session-up.sh`, not inline in the YAML**, for the
reason `emulator-launch.sh` exists: a script can be run and watched locally for nothing,
and a workflow step can only be run by spending a dispatch. `CLAUDE.md`'s most expensive
lesson — six runs spent iterating on a failure nobody could observe — was fixed by exactly
this move.

## Complexity Tracking

> No Constitution Check violations. Table intentionally empty.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| *(none)*  | —          | —                                    |
