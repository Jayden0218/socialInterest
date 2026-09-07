# Quickstart: proving feature 004 actually runs

**Feature**: `004-chat-places-and-depth` | **Date**: 2026-09-06

A validation guide, not an implementation guide. Every scenario below is a thing you can
run; each one names the requirement it proves and the way it is expected to fail.

The bias throughout is the one the project learned the hard way: **the only tests that have
ever found a real defect in this product are the ones that make a request or drive the app.**
Unit tests are listed where they define a contract and nowhere else.

## Prerequisites

```bash
# Cloud sandbox only, and neither step survives a container reset:
mkdir -p /etc/docker
echo '{ "registry-mirrors": ["https://mirror.gcr.io"] }' > /etc/docker/daemon.json
setsid nohup dockerd > /var/log/dockerd.log 2>&1 < /dev/null &

pnpm install
docker compose up -d          # DynamoDB Local (user: root) + MinIO
export LOCAL_JWT_SECRET=...   # no default; the API refuses to boot without it
```

`RUNTIME_PROFILE` accepts `local` and nothing else. Nothing in this feature provisions
anything, and nothing needs a cloud account.

## The gates, before anything else

Two contracts must have tests before the code they govern (Constitution: "tests that define a
contract are written first").

```bash
pnpm test:visibility     # must be 462 assertions, not 294, and must FAIL first
pnpm --filter @sih/api test:unit -- conversation-access
```

**Expected first result: red.** `test:visibility` fails on four missing surfaces;
`conversation-access` fails because the module does not exist. A green run here before the
implementations exist means the surface list was not actually extended — check
`contracts/visibility-matrix-addendum.md` against `apps/api/tests/visibility/matrix.spec.ts`.

## US1 — Two people can talk

```bash
pnpm --filter @sih/e2e test -- conversations
```

Proves, over HTTP, against a running API, driving `apps/mobile/src/data`:

| Scenario | Requirement | Passes when |
|---|---|---|
| A sends B a message; B reads it | FR-001, FR-002 | B's inbox shows the conversation, unread 1 |
| Delivery with the conversation open | FR-011, **SC-001** | The long-poll returns in **under 2 s**, measured; the expected case is sub-second |
| First message from a non-followed sender | FR-003, FR-004, **SC-003** | Lands in `?state=requested`; **zero** notifications created |
| Accept, then send again | FR-005 | Moves to the accepted inbox; a notification is created |
| Decline, then send again | FR-005 | `202`, nothing stored, and the sender cannot tell |
| Block from either side | FR-006, **SC-004** | Both sides get `404` on read and write, identical to non-existence |
| Share a post, then the author makes it private | FR-009, **SC-005** | The message is still returned; `sharedPost` is `null` with `not-for-you` |
| Report a message | FR-007, FR-042 | Appears in the existing moderation queue; the action is in the audit log |
| Message activity changes no feed | **FR-012** | Feed contents and order are byte-identical before and after a conversation |

```bash
docker compose restart api dynamodb   # then re-run
pnpm --filter @sih/e2e test:durability -- conversations   # SC-002
```

**How this is expected to fail**: the long-poll returns immediately with an empty page every
time. That means the handler is not awaiting the event bus and the client is doing
fixed-interval polling by accident — the latency assertion will still pass at small scale and
the load characteristic will be wrong. Assert the **number of requests**, not only the latency.

## US2 — A post can be about a place

```bash
pnpm --filter @sih/e2e test -- places
```

| Scenario | Requirement | Passes when |
|---|---|---|
| Type a name, see existing places | FR-014, FR-022, **SC-007** | The existing place appears **before** the create action, in every fixture case |
| Create, attach, publish | FR-013, FR-015 | The post carries the place; the place page lists it |
| Open the place page as a stranger, then signed out | FR-016, FR-017, **SC-005** | Exactly the posts the matrix says, on surface 8 |
| **Follow the place, do not follow its interest** | **FR-019**, **SC-006** | The post appears in the home feed **zero** times |
| Report a place name; operator merges two places | FR-020, FR-042 | Posts and followers move; nothing is orphaned |
| Publish media carrying EXIF GPS | **FR-021**, **SC-008** | The result has **no place**, and none was suggested |

SC-008 needs a fixture that actually carries GPS:

```bash
node apps/e2e/scripts/make-exif-fixture.mjs    # writes an image with GPS tags
```

**How this is expected to fail**: SC-006 passes for the wrong reason. If the feed happens not
to include the post because of paging, ranking, or an empty candidate set, the assertion is
green and proves nothing. The test must first show the post **does** appear when the interest
*is* followed, then unfollow the interest and show it does not. Two halves, one test — the
same shape as 001/FR-033's.

## US3 — An interest page is worth opening

```bash
pnpm --filter @sih/e2e test -- interest-depth
```

| Scenario | Requirement | Passes when |
|---|---|---|
| Description, follower count, sub-interests render | FR-025, FR-026 | Present on the interest response |
| Switch `order=new` ↔ `order=top` | FR-027, FR-028, **SC-009** | The **set of post ids is identical**; only order differs |
| Search within an interest | FR-029, **SC-005** | Surface 11 holds the full matrix; matching happens after filtering |
| Report a description | FR-030, FR-042 | Enters the queue as `interest-description` |

**How this is expected to fail**: `order=top` runs its own query. It will look right and
SC-009 will catch it — provided SC-009 compares id **sets**, not first pages.

## US4 — The holes in what already shipped

```bash
pnpm --filter @sih/api test:integration -- notification-preferences
pnpm --filter @sih/e2e test -- people-search
```

| Scenario | Requirement | Passes when |
|---|---|---|
| Turn reactions off; someone reacts | FR-031, **SC-010** | **Zero** notification rows written. Not "filtered from the list" — not written. |
| Comment and follow still notify | FR-031 | Unaffected |
| Preferences survive a new session | FR-032 | Read back on a fresh token |
| Search a person; blocked in either direction | FR-034, FR-035, **SC-012** | Excluded in 100% of the block fixture set |
| Search a non-active person | FR-036 | Absent |

Video is the one item here that cannot be closed by a local suite alone:

```bash
# needs a real video committed at apps/e2e/fixtures/sample.mp4
pnpm --filter @sih/e2e test -- video-publish     # upload -> transcode -> poster
```

...and then, for **SC-011**, an Android run — `.github/workflows/android-emulator.yml`,
`workflow_dispatch`. Until that run exists, 001/FR-005 and 001/FR-009 stay **unverified**,
and must be reported that way rather than as "the code path is there".

## US5 — Save a post

```bash
pnpm --filter @sih/e2e test -- saved
```

| Scenario | Requirement | Passes when |
|---|---|---|
| Save, list, unsave | FR-037 | Present, then absent |
| A second identity reads the saver's saves | FR-038 | Impossible — no endpoint reaches them |
| The saved post's visibility later excludes the saver | FR-039, **SC-013** | It appears **zero** times; surface 9 holds the matrix |

## On the device

The journeys above prove the service. They say nothing about whether the app calls it —
which is the defect this codebase produces most often.

```bash
# CI only. Costs Actions minutes; the emulator does not run in this sandbox
# (no /dev/kvm; system_server is killed by its own watchdog under TCG).
# workflow_dispatch: .github/workflows/android-emulator.yml
```

New Maestro flows, each starting from a tab or a post — never from a screen rendered directly:

| Flow | Proves |
|---|---|
| `13-send-message.yaml` | Chats tab → conversation → send → the message is read back through `GET /conversations/{id}/messages` |
| `14-message-request.yaml` | A stranger's message lands in Requests and produces no notification badge |
| `15-attach-place.yaml` | Compose → place picker → publish → the place chip appears, and `GET /places/{id}/posts` returns the post |
| `16-place-page.yaml` | Post → place chip → place page → follow |
| `17-saved.yaml` | Post → save → profile → saved list |
| `18-notification-settings.yaml` | Profile → settings → turn reactions off → no notification arrives |

Each asserts its effect **through the service**, matching
`docs/verification/runs/2026-09-06-journey-run-android-PASS.md`. A Maestro flow that asserts
only on the view hierarchy would have passed for all seven of the defects that run found.

## Full sweep before pushing

Run the real CI step list, not a proxy for it. Two red builds came from checking
typecheck/lint/tests and assuming that covered CI.

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm verify:local
pnpm --filter @sih/e2e test
```

## What this quickstart cannot prove

Stated here so it is not accidentally claimed:

- **Push notifications to a backgrounded device.** No push service; out of scope.
- **Chat under any concurrency.** 003 measured the ceiling as DynamoDB Local at 882 req/s.
  Long-poll adds held connections on top of that. No local run settles it.
- **That a hosted deployment can serve chat this way.** Registered as a divergence
  (research R1, Constitution V). A green local chat suite is not evidence for it.
- **That anybody wants any of this.** Nobody has used the product. Unchanged since 003.
