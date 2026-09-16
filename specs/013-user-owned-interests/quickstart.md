# Quickstart: validating 013

**Feature**: 013 | **Date**: 2026-09-16

How to prove this feature works, at the tier that can actually support each claim.

## Prerequisites

```bash
docker compose up -d           # Postgres
pnpm --filter @sih/infra db:create-local-pg --recreate
```

**No `seed:catalogue`.** That script is deleted by this feature — an installation starts with no
interests at all, and that is the point.

## 1. The measurement that must come FIRST (SC-004)

```bash
pnpm --filter @sih/api exec jest tests/integration/interest-name-uniqueness.spec.ts
```

Fire N simultaneous creations of one name and **count the interests that result**. Expect 1.

**Run this before the fix and record the number.** 011 established that a read-then-write yields an
occasional 2 while an absent constraint yields a reliable N — and that a fix aimed at narrowing a
window is the wrong diagnosis for the second. The count decides which this is.

**Size the batch to the rate limiter's capacity and clear it first.** 011's concurrency test would
otherwise have passed for the wrong reason: six sign-ups against a route with capacity five meant
five were refused **429** without ever reaching the constraint, and deleting the constraint left
the test green.

## 2. The gate that fails open (SC-005)

```bash
pnpm --filter @sih/api exec jest tests/unit/interest-similarity-is-global.spec.ts
```

Create two interests, then propose a name close to one of them. It must come back as a candidate.

**This must be watched RED against a sibling-scoped `findSimilar`.** With no parents the candidate
list is empty, `isTooSimilar([])` is false, and the name is accepted — silently. A test that has
only ever passed says nothing about a guard whose subject can vanish.

## 3. Case and punctuation converge (SC-003)

```bash
pnpm --filter @sih/api exec jest tests/integration/interest-naming.spec.ts
```

Publish with "Bouldering", then "bouldering", then "  BOULDERING!! ". Expect **one** interest and
three posts in it. Generated over a set of variants, not three hand-picked ones.

## 4. No interest without a post (FR-004)

Publish, then fail a publish deliberately after the interest name is new. Expect **zero**
interests created by the failed attempt — one transaction, so it rolls back with the post.

## 5. A merge, end to end (SC-007, SC-008)

Merge one interest into another as an operator, then check: the posts and followers arrive, every
route to the source leads to the target, and **the author's own post still shows the word they
typed**.

## 6. The regression gates that must NOT move (SC-011)

```bash
pnpm --filter @sih/api exec jest tests/visibility/matrix.spec.ts tests/integration/auth-surface.spec.ts
```

Expect **1,488 assertions across 16 surfaces**, and the route snapshots unchanged. **If a number
moves, stop and find out why — never update the number to match.**

## 7. The copy, not only the code (SC-009, FR-021)

```bash
grep -rin "sub-interest\|parent interest\|choose an interest\|catalogue" apps/mobile/src apps/api/src
```

007 shipped a follow hint describing a withdrawn requirement because only the code was updated.
The sub-interest roll-up is withdrawn here; grep the copy.

## 8. Over HTTP, because only a request finds some of this

```bash
pnpm --filter @sih/e2e test
```

002's lesson: both sides generated from one document agree with each other by construction. The
contract and a generated client cannot catch a publish that no longer matches. Only a request can.

## What cannot be validated here

- **Anything on a device.** No emulator runs in this sandbox and nothing since 011 has run on one.
  Report **not run**; do not infer it from a passing browser render.
- **Anything needing object storage.** MinIO publishes to quay.io, which this environment's egress
  blocks, so media-carrying paths fail here for that reason and not for this feature's.
