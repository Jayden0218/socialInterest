# Quickstart — validating the redesign

Every command here runs against the local profile. **No cloud resource is
provisioned and none may be**: the cost rule is the owner's standing instruction.

## Prerequisites

The sandbox loses the Docker daemon on container reset, and neither step below
survives one:

```bash
mkdir -p /etc/docker
echo '{ "registry-mirrors": ["https://mirror.gcr.io"] }' > /etc/docker/daemon.json
setsid nohup dockerd > /var/log/dockerd.log 2>&1 < /dev/null &

docker compose up -d
pnpm --filter @sih/infra db:create-local
pnpm --filter @sih/infra s3:create-local
pnpm --filter @sih/infra seed:catalogue
```

## 1. The guards, BEFORE any redesign work

These must pass against the current code. A guard that only passes after the
change cannot tell you the change was safe.

```bash
pnpm --filter @sih/mobile exec jest src/__tests__/testid-snapshot
pnpm --filter @sih/mobile exec jest src/__tests__/contrast
pnpm --filter @sih/mobile exec jest src/__tests__/touch-target
node scripts/verify-maestro-ids.mjs
```

**Expected**: all pass. `verify-maestro-ids` reports 150 selectors across 19
flows, 178 literals and 39 dynamic prefixes.

**Prove the snapshot guard actually catches something** — rename one testID, run
it, watch it fail, put it back. A guard nobody has seen fail is a guard nobody
knows works; this repository has written three that passed against the defect
they existed to catch.

## 2. While building

```bash
pnpm --filter @sih/mobile test        # 71 tests
pnpm typecheck && pnpm lint
```

## 3. Behaviour must be unchanged

The redesign changes appearance. If any of these change, something else changed
too, and that is the finding.

```bash
pnpm --filter @sih/api test           # 815 tests, 45 suites
pnpm --filter @sih/e2e test           # 129 tests, 21 suites
```

**Run `@sih/e2e` alone.** It boots its own API in `globalSetup` and kills it in
`globalTeardown`; two concurrent invocations kill each other's server and produce
a page of `TypeError: fetch failed` that looks like a product failure and is not.

## 4. See it

```bash
cd apps/e2e && npx tsx scripts/capture-screens.ts
```

Writes 20 screens to `docs/screens/`. Keep the **before** set — the current UI is
already captured there — so the change is reviewable rather than described.

**What this proves**: the components render, with real data from a real API.
**What it does not prove**: anything about Android. These are `react-native-web`
renders through DOM primitives — not native layout, fonts, safe areas or touch
handling. Principle V.

## 5. The device run — required, not optional

This feature touches every screen the app has. Gate **G5**: it is not complete
without this.

```
Dispatch .github/workflows/android-emulator.yml on the branch.
```

Free on this public repository. ~30 minutes. **Expected: 19/19 flows.**

Two failure modes already paid for, so they are not rediscovered:

- A flow that chains another flow inherits its writes. A toggle is not
  idempotent, and flows share one server.
- The tab bar exists only at the root of the stack. On a pushed screen there is
  `nav-back`, not `tab-chats`.

If a flow fails on navigation, reproduce it in `apps/e2e/browser/navigation.spec.ts`
first. It settles in three seconds what a device run answers in twenty-five
minutes.

## 6. Before pushing

Run the real CI step list from `.github/workflows/ci.yml`, not a proxy for it.
Two red builds in 002 came from checking typecheck/lint/tests and assuming that
covered CI.

## Definition of done

| | Check |
|---|---|
| SC-001 | Media, author, interest and counts on all five post surfaces; zero rendering a bare caption |
| SC-003 | Two interests distinguishable with titles removed |
| SC-004 | Contrast test green over both palettes and the whole interest colour space |
| SC-005 | testID snapshot unchanged, `verify-maestro-ids` passes, 19/19 Maestro, browser journeys pass |
| SC-006 | A list does not shift as media loads |
| SC-007 | Touch-target test green |
| SC-008 | Before/after screenshots both in `docs/screens/` |
| SC-009 | 815 API, 129 e2e, 71 mobile — unchanged |
| **FR-008** | **Recorded as NOT MET.** List images are full-size; no thumbnail rendition exists (R4). Reporting it met because images appeared would be false |
