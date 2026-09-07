# Quickstart: validating feature 005

How to prove this feature works, and what each check is worth. Every command here runs on
the local profile with no cloud account.

The organising rule, learned expensively across 001–004: **a green suite is not evidence
that the product works.** Twenty defects in this codebase were invisible to a passing test
suite and visible the moment something issued a real request or drove a real device. So the
checks below are ordered by what they can actually establish, weakest first.

## Prerequisites

```bash
# Docker, once per container (neither step survives a reset - see CLAUDE.md)
mkdir -p /etc/docker
echo '{ "registry-mirrors": ["https://mirror.gcr.io"] }' > /etc/docker/daemon.json
setsid nohup dockerd > /var/log/dockerd.log 2>&1 < /dev/null &

docker compose up -d
pnpm --filter @sih/infra db:create-local
pnpm --filter @sih/infra s3:create-local
pnpm --filter @sih/infra seed:catalogue
```

`LOCAL_JWT_SECRET` has no default (003/FR-007). Export one before booting the API.

## 1. The contract test, first

Gate G4: the visibility matrix addendum declares itself a contract, so its test exists
before the code it governs.

```bash
pnpm --filter @sih/api test tests/visibility/matrix.spec.ts
pnpm --filter @sih/api test tests/visibility/surface-routing.spec.ts
```

**Expect 480 assertions, zero skipped**, and `surfaces without a routing probe yet: none`.

*What this is worth*: the matrix proves the decision table is implemented. It cannot prove
any surface consults it — every row runs the same function, so 480 assertions would
otherwise mean one function tested 240 times. `surface-routing.spec.ts` is the half that
matters, and for this feature it must show the review path uses the **same** block
resolution as the post path, not a second one that agrees today.

## 2. The Principle I guard

```bash
pnpm --filter @sih/api test tests/unit/feed-does-not-read-place-follows.spec.ts
```

**Expect**: fails if `FeedService` imports the rating or review repository at all.

*What this is worth*: it fails when the *dependency* appears, which is earlier than any
behavioural test can manage — a behavioural test needs the code to exist and a post to
exercise it. Gate G3 requires this extended before the review read path is written.

## 3. The migration, against rows the old code wrote

```bash
pnpm --filter @sih/api test tests/integration/conversation-migration.spec.ts
```

**Expect**: conversations created through the *previous* write path are readable, under
their original ids, after the backfill.

*What this is worth*: this is SC-008, and it is the one check here that cannot be faked by
re-creating fixtures under the new code. Research R2 moves an authority; "existing
conversations still work", verified by making new ones, proves nothing about rows already on
disk. 001's suites called `reconcile()` by hand and hid a defect that made the whole product
unusable — same shape.

## 4. Journeys over HTTP

```bash
pnpm --filter @sih/e2e test
```

**Expect** new journeys covering:

| Journey | Proves |
|---|---|
| rate a place, read the average back | SC-001, SC-002 |
| rate twice, count stays 1 | SC-003, FR-002 |
| withdraw, average recomputes | FR-003 |
| review, then block, both directions | SC-004 |
| report a review, moderator removes it, log survives | SC-006, FR-015 |
| removed review leaves the average | FR-016, R6 |
| three-person group, everyone receives everything | SC-007 |
| stranger's group invite notifies nobody | SC-009 |
| leave a group | SC-011 |

*What this is worth*: these drive the app's own data layer against a running API, which is
what found five defects in 002 that no contract test could. Do not let them drift into
driving the generated client — both sides are generated from one document and agree with
each other by construction.

## 5. The negative journeys — the ones that matter for Principle III

```bash
pnpm --filter @sih/e2e test journeys/negative.spec.ts
```

These issue **raw requests**, bypassing the app's data layer. Three checks here cannot be
made any other way:

- **SC-010** — the participant cap holds against a request that skips the client.
- **SC-012** — the refusal for adding a blocked person is byte-identical to every other
  "cannot add" refusal. Compare literal responses: a distinct error code, a distinct message,
  or a distinguishable latency leaks the block just as well as saying so.
- **SC-004** — a blocked person's review is absent through the hostile path, not merely
  filtered by the app.

*What this is worth*: a server-side guarantee tested only through the well-behaved
first-party client is not tested at all. That is Principle III, and it is the client that
will exist.

## 6. Response shape

```bash
pnpm --filter @sih/e2e test journeys/response-shape.spec.ts
```

**Expect**: reviews come back hydrated — author, score, body, timestamps — matching the
contract.

*What this is worth*: **six surfaces in this codebase have shipped returning raw candidate
rows.** The interest space, the product's primary browse surface, returned rows with no
caption, no media, no author and no counts, and survived because nothing asked. The filter
decides what is visible; it never decides the shape of what to send.

## 7. On a device

```bash
# Free on this public repository; ~27 minutes.
# Workflow: .github/workflows/android-emulator.yml (workflow_dispatch)
```

**Expect** two new Maestro flows — `20-rate-place`, `21-group-chat` — inside a 19/19 pass,
each asserted **through the service** afterwards: a `PUT /v1/places/{id}/rating` 200 and a
group `POST .../messages` 201 in the API's own log.

*What this is worth*: more than everything above put together, on past evidence. Running the
app on Android found seven defects in 003, six in 004 and two more on the device pass, every
one invisible to a green suite. A view assertion is satisfied by an optimistic render, which
is why the effects are checked in the API log rather than the view hierarchy.

## 8. The full CI step list

```bash
pnpm typecheck && pnpm lint
pnpm --filter @sih/api test
pnpm --filter @sih/mobile test
pnpm --filter @sih/workers test
node scripts/verify-maestro-ids.mjs
pnpm --filter @sih/e2e test
pnpm --filter @sih/api smoke:boot
pnpm verify:register
```

Run **this list**, not a proxy for it. Two red builds in 002 came from checking
typecheck/lint/tests and assuming that covered CI.

## What none of this establishes

- **Whether a hosted deployment can hold group long-polls.** Divergence `D-004-1`, still
  open. A local process holding 200 waiters says nothing about it.
- **Whether anyone writes reviews.** A journey that writes one measures the journey.
- **iOS.** Nothing has ever run there.
- **Behaviour at scale.** A place with thousands of reviews hits the A35 limit recorded in
  data-model.md, deliberately not solved now.
