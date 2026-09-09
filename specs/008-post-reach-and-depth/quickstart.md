# Quickstart: verifying 008

**Feature**: 008 | **Date**: 2026-09-09

How to prove each phase works. Not how to build it — that is `tasks.md`.

## Prerequisites

The local profile, all in Docker. In this sandbox, **two setup steps that do not survive a
container reset**:

```bash
mkdir -p /etc/docker
echo '{ "registry-mirrors": ["https://mirror.gcr.io"] }' > /etc/docker/daemon.json
setsid nohup dockerd > /var/log/dockerd.log 2>&1 < /dev/null &
```

Then:

```bash
docker compose up -d          # DynamoDB Local + MinIO
pnpm install
pnpm --filter @sih/api dev
```

`RUNTIME_PROFILE=local` is the only accepted value. `LOCAL_JWT_SECRET` has no default.

**Before believing a paging or bounded-page failure, check the table size.** 007 spent time
on two "regressions" that were a shared table grown to 3,875 people across runs. Drop and
reseed the local table first.

## The step list that actually gates a push

Run the **real CI step list**, not a proxy for it. **There is no `pnpm verify` aggregate** —
the list lives in `.github/workflows/ci.yml` and must be run in that order. Two red builds
have come from checking typecheck, lint and tests and assuming that covered CI.

```bash
pnpm typecheck && pnpm lint
pnpm --filter @sih/infra db:create-local
pnpm --filter @sih/infra s3:create-local
pnpm --filter @sih/infra seed:catalogue
pnpm --filter @sih/api test
pnpm --filter @sih/mobile test
pnpm --filter @sih/workers test
pnpm --filter @sih/shared generate:client
pnpm --filter @sih/e2e test              # the journeys that catch what the rest cannot
pnpm --filter @sih/api smoke:boot
pnpm --filter @sih/e2e test:durability
pnpm --filter @sih/infra verify:stack && pnpm --filter @sih/infra synth
pnpm verify:register
```

`synth` is free and needs no credentials; **applying it is never part of a task.**

## Phase A

### US1 — the whole post

```bash
pnpm --filter @sih/e2e test -t "media set"
```

Publishes a post with **ten** images and asserts ten reachable items on the detail surface,
in publication order (SC-001); then a fixture of single-image, multi-image, video and
partially-failed posts with **zero unreachable items** (SC-002).

The failure this replaces was invisible to a green suite because every post fixture had one
media item. **Confirm the new fixture has more than one** — a multi-item assertion against a
single-item fixture passes and means nothing.

Browse-surface check (FR-003): the indicator is present and the card is **not** navigable
per item. A swipeable card inside the waterfall would fight the parent scroll and, per
007/R6, nesting scrollables disables windowing.

### US2 — notifications that can be read

```bash
pnpm --filter @sih/api test -t "notification read"
pnpm --filter @sih/e2e test -t "notifications"
```

Over HTTP: generate notifications, `GET` them, `PUT /v1/me/notifications/read`, `GET` again
— `readAt` populated, `unreadCount` 0 (SC-003). Then generate one more and assert the count
is exactly 1, not "some". Then a second account: their count is untouched (FR-007).

**Assert `readAt` from a real response.** A stubbed data layer that agrees with a wrong type
is how 007's `nextCursor` defect survived five features.

### US3 — the Following feed

```bash
pnpm --filter @sih/api test -t "following"
pnpm --filter @sih/e2e test -t "following"
```

- Mixed fixture, zero unfollowed-author posts (SC-004).
- Strictly descending `createdAt`, **across a page boundary** — page two must actually load.
- Signal profile read before and after: unchanged (SC-005).
- The structural guard, **verified red** by adding a real import of `RankingService` and
  watching it fail before trusting it green.

### Phase A device run

```bash
scripts/android-device-pass.sh
```

Read the **whole-run API aggregate** — it prints last, and to `$GITHUB_STEP_SUMMARY`.
Expect `PUT /v1/me/notifications/read` 204 and `GET /v1/feed/following` 200 from the device.
An absent line is the finding; a present one is the evidence. Job logs come back only as a
tail and the artifact host is denied by this environment's egress with a 403, so anything
that must be read has to print late and short.

## Phase B

```bash
pnpm --filter @sih/e2e test -t "avatar"
pnpm --filter @sih/e2e test -t "post search"
```

**US5 is the one to check properly.** Set an avatar once, then assert `avatarUrl` is present
**and fetchable** (a 200, not a 403) on every profile-bearing response: post author, comment
author, review author, conversation participant, notification actor, people search, own
profile (SC-008). A raw storage key returns 403 against a private bucket — that is the
current behaviour on the one surface that emits it at all, and is 006/R4b's defect in a
second place.

**US4 needs no server change.** Verify rather than rebuild: a send to somebody never messaged
creates a *request*, and a send a block forbids is refused **without revealing the block** —
through the path a modified client would take, not the app's (SC-007, Principle III).

Search: a distinctive caption word finds the post; a viewer who may not see it finds nothing
(SC-009); the signal profile does not move (SC-005).

## Phase C

```bash
pnpm --filter @sih/api test -t "comment"
pnpm --filter @sih/e2e test -t "replies"
```

Replies grouped with their parent across a fixture that includes a reply-to-a-reply
(attaches to the deepest permitted ancestor, FR-025) and a **moderated parent whose replies
stay readable** (FR-026, SC-010).

Alt text (SC-011): the guard enumerates every `Image` render **per tag**, not per file. A
per-file check lets one labelled image approve every other image in the same file — exactly
how the touch-target guard passed over a 36.7pt target under a comment claiming 44.

Drafts (SC-012): save with media, caption, interest and place; reopen; zero fields lost.
Note the stated limit — a draft older than its uploads' expiry restores everything but media
and **says so** rather than appearing to have silently lost data.

## Phase D

```bash
pnpm --filter @sih/api test -t "mute"
pnpm --filter @sih/api test -t "privacy"
pnpm --filter @sih/api test:visibility
```

**The load-bearing check is the one that asserts mute does NOT hide things** (SC-013): a
muted author's posts are absent from feed, Following and search, and **present** on their
profile and via `GET /v1/posts/{id}`, with the follow and any conversation intact. Run it red
with mute wired into `VisibilityFilter` — it must fail — then green.

Private accounts (SC-014): the generated matrix, zero skipped rows, including the new
`pending-follower` relationship. And the saved list: a post saved before its author went
private stops being readable.

Appeals: an author is told what was removed and why; the appeal is readable by author and
moderators only, asserted through the hostile path.

## Phase E

```bash
pnpm --filter @sih/e2e test -t "collections"
```

A post added to a collection is **still in the undifferentiated saved list** (FR-051) — the
bug this catches is a collection add that quietly moves rather than adds. Collections and
drafts unreadable by anyone but their owner on every enumerated surface (SC-015), hostile
path.

## Every phase ends the same way

1. The real CI step list, green.
2. `contracts/visibility-matrix.md` with **zero skipped rows** (SC-016), and every new
   surface also in `surface-routing.spec.ts` — a matrix row for a surface that never calls
   the boundary passes for the wrong reason.
3. An Android device run, asserted **through the service** (status codes in the aggregate),
   never through the view hierarchy.
4. SC-017 measured, not assumed: every new control reachable at the largest platform font on
   the shortest supported screen. Where a control sits above its field, that is an invariant
   and needs no number. Where it necessarily sits below one, bound the guard by what a device
   demonstrably reached (`ngmeasure.spec.ts`, 289) — **never by 640 minus a guess**. A soft
   keyboard cannot be measured in a browser; react-native-web does not have one.
5. `tasks.md` boxes checked. The checklist is the record, and in 007 it was right when the
   summary was not.

## What this feature will not be able to claim

- **iOS.** Nothing has ever run. Unverified, not "probably fine".
- **Scale.** Every latency figure here is measured against DynamoDB Local, which is the
  lowest ceiling in this stack by an order of magnitude. 002/SC-002 stays unverified and
  only a provisioned-datastore run can close it — the owner's call.
- **Real usage.** Nobody has used the product. A script exercising a path measures the
  script.
