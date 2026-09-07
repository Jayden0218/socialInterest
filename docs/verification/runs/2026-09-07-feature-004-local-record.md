# Feature 004 — what was verified, and where, on 2026-09-07

A record of observations, not a summary of intentions. Every figure below was
produced by a command in this repository against a running stack; anything not
run says so.

**Scope**: `specs/004-chat-places-and-depth` — conversations, places, interest
depth, the shipped-scope holes, saved posts. 128 of 140 tasks.

## Suites

| Command | Result |
|---|---|
| `pnpm typecheck` | 6/6 packages clean |
| `pnpm lint` | clean |
| `pnpm --filter @sih/api test` | **737 passed**, 36 suites, 0 skipped |
| `pnpm --filter @sih/mobile test` | 51 passed |
| `pnpm --filter @sih/workers test` | 6 passed |
| `pnpm --filter @sih/e2e test` | **99 passed**, 18 suites — journeys + 14 browser cases, over real HTTP |
| `pnpm --filter @sih/e2e test:durability` | restarts real containers |
| `node scripts/verify-maestro-ids.mjs` | every selector exists in the app |
| `pnpm verify:register` | one divergence entry, no unbacked claim |
| `pnpm --filter @sih/api smoke:boot` | **9/9 routes healthy** under the production runner (tsx) |

## Success criteria

| Criterion | Result | How |
|---|---|---|
| SC-001 message delivery < 2s | **met, 301ms** | Long poll armed before the send, over HTTP |
| SC-002 conversation survives a restart | **met** | `docker compose down` + `up`; derived id resolves, 5 messages in order, unread count and preview intact |
| SC-003 a request notifies nobody | **met, zero** | Held for 1.5s with `consistently`, not checked once |
| SC-004 a block severs both ways | **met** | Both sides, both operations, all 404 |
| SC-005 the matrix on every surface | **met, 462/462** | 11 surfaces, **0 skipped**, every one with a routing probe |
| SC-006 a place-follow does not widen the feed | **met** | Two halves: it DOES reach the feed with the interest followed, and never without |
| SC-007 near-duplicate names dedupe | **met, 12/12** | 8 that must match, 4 that must not, including the same name in a different city |
| SC-008 no place from media metadata | **met** | EXIF-GPS fixture published through the raw HTTP path |
| SC-009 orderings agree on membership | **met** | Id SETS across the whole listing, engaged and quiet |
| SC-010 a suppressed notification is not written | **met, zero rows** | Read from the repository, not the list endpoint |
| SC-012 people search excludes blocks | **met, both directions** | Including the case where they blocked the searcher |
| SC-013 an inaccessible saved post is absent | **met** | Visibility flipped after saving; also after deletion |
| SC-014 all of it on the `local` profile | **met** | No cloud account, no credentials, nothing provisioned |

### Not met, and why

| Criterion | State | Blocked on |
|---|---|---|
| **SC-011 — a video PLAYS on a device** | **unverified** | An emulator run. 001/FR-005 and FR-009 have been reported complete twice without one; the service path is now exercised, the device path is not |
| **004 on Android at all** | **unverified** | The same run. Seven Maestro flows are written and their selectors checked; none has executed |
| **iOS** | **unverified** | Nothing has ever run. The Simulator is macOS-only |
| **002/SC-002, concurrency** | **unmeasured** | A provisioned datastore, which needs approval to spend |
| **Real usage** | **unanswered** | Nobody has used the product |

## Measured

`bench:chat --holders=200`, one API process:

| n held polls | deliver + wake p50 | p95 | max |
|---|---|---|---|
| 5 | 49ms | 65ms | 65ms |
| 200 | 39ms | 51ms | 53ms |

The server's connection handling is not the limit at this scale. This says
nothing about a hosted deployment: long-poll is a registered Constitution V
divergence (`D-004-1`), and every reason that entry exists — edge idle timeouts,
balancer connection limits, a waiter and a writer in different processes — is
untouched by a measurement of one Node process holding sockets.

## Defects found, all of them pre-existing

Feature 004 introduced none of these. Each was found by a test that made a
request and looked at what came back.

1. **The interest space returned candidate rows.** `postId, authorId,
   visibility, processingState, createdAt` — no caption, no media, no author, no
   counts, on the product's primary browse surface. Sixth instance.
2. **The feed had a second responder.** `interestIds` (raw ids) where the
   contract promises `interests` (refs), and no media. A client generated from
   the contract crashes on `post.interests.map`.
3. **The video transcode failed on any clip under a second.** `-ss 00:00:01`
   seeks past the end, ffmpeg writes nothing, and the post sits at `failed`
   permanently — visible only to its author.
4. **`posterUrl` was never sent.** It appears nowhere in the API source, so
   FR-009's thumbnail reached no client. The raw media record went out instead,
   leaking `originalKey` — the path of the pre-strip upload.
5. **A recipient replying did not accept the conversation**, so the initiator
   was refused on their second message with "wait for a reply" — to a reply they
   had already received.
6. **Four integration tests waited for a duration, not a condition.** Red in CI,
   green locally, twice.

## Mistakes I made, recorded because the guards came from them

- A misplaced `@Public()` decorator, **twice**. Inserting a method above an
  existing route moves the decorator to the new one. First time: a write became
  public. Second time: signed-out profile reads started 401ing. The first guard
  was a hand-picked list and missed the second occurrence; it now enumerates
  every route and compares to a snapshot.
- A hook declared after a container's `return` — dead code, and the save button
  did nothing. Typecheck, lint and 50 mobile tests were all clean.
- Two fixtures rebuilt that already existed and were unused (`jpegWithGps`,
  `mp4Short`).
- Claimed FR-049 had no implementation. It was implemented end to end; the grep
  searched for the wrong identifier.
