# Quickstart — 007

How to prove this feature works, end to end, on the local profile. No cloud account.

## Prerequisites

```bash
# The daemon does not survive a container reset in the sandbox
setsid nohup dockerd > /var/log/dockerd.log 2>&1 < /dev/null &
docker compose up -d
pnpm --filter @sih/infra db:create-local
pnpm --filter @sih/infra s3:create-local
pnpm --filter @sih/infra seed:catalogue
export LOCAL_JWT_SECRET=$(openssl rand -hex 32)   # no default, by design
```

## 1. The ranking boundary holds (G4 — the one that matters)

```bash
pnpm --filter @sih/api test -- ranking-cannot-admit
pnpm --filter @sih/api test -- ranked-feed
```

Expected: C1–C5 from `contracts/ranking-boundary.md` all pass. **C4 is the important
one** — the served set is always a subset of the proposed set. A ranker that drops a post
is a bug; a pipeline that admits one is a privacy failure.

## 2. A visibility change still lands immediately

```bash
pnpm --filter @sih/e2e test -- feed
```

Expected: a post flipped to private is absent from the ranked feed on the **first**
request after the flip. Not eventually.

## 3. The feed moves in the direction of the signals (SC-001)

```bash
pnpm --filter @sih/e2e test -- signals
```

Expected: after a scripted session that dwells on one interest and skips another, the
engaged interest's posts appear measurably earlier. The assertion compares positions
before and after — it does not eyeball the output.

## 4. The feed cannot collapse (SC-004)

```bash
pnpm --filter @sih/api test -- explore
```

Expected: across 100 consecutive responses for a viewer whose signals all point at one
interest, no response is entirely that interest.

## 5. Signals are private, against a hostile client (G5)

```bash
pnpm --filter @sih/e2e test -- negative
```

Expected: the five checks in `contracts/signals.md` — a signal for an invisible post is
rejected, a signal naming someone else is rejected, an absurd dwell is clamped, no
surface leaks another person's profile, and clearing empties the store.

## 6. The redesign, measured rather than eyeballed

```bash
pnpm --filter @sih/mobile test        # contrast, touch targets, testID snapshot, guards
pnpm --filter @sih/e2e test -- safety-fit
npx tsx apps/e2e/scripts/capture-screens.ts   # run from apps/e2e
```

Expected: every testID still resolves (FR-027), every control ≥44pt (SC-009), and the
safety sheet's block control reachable at 640pt (SC-010 — the case that reached production
once).

## 7. Reset returns the feed to its seed state (SC-003)

Clear signals in Settings, then request the feed. It ranks as it would for a new account
holding the same seed interests. Assert against the store, not the button.

## 8. The full CI step list, then a device

```bash
# Every step from .github/workflows/ci.yml, in order. Run @sih/e2e ALONE —
# two concurrent jest invocations kill each other's API and produce a page of
# `fetch failed` that reads like a product failure.
pnpm typecheck && pnpm lint
pnpm --filter @sih/api test && pnpm --filter @sih/mobile test && pnpm --filter @sih/workers test
node scripts/verify-maestro-ids.mjs
pnpm --filter @sih/e2e test
pnpm --filter @sih/api smoke:boot
pnpm --filter @sih/e2e test:durability
```

Then dispatch `.github/workflows/android-emulator.yml`. **The feature is not complete
without it.** Constitution V: a browser is not a device, and this project has three
separate defects on record that only a device run found.

## What this cannot tell you

- **Whether the ranking is any good.** SC-001 measures direction, not quality. That needs
  real usage, which the product has never had.
- **Whether the block-wise waterfall's column re-sync is visible.** Research R6 records the
  fallback; only a device shows the answer.
- **Anything about iOS.** Nothing has ever run there.
