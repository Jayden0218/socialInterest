# 008 on Android — run 59, a clean pass

**Date**: 2026-09-09 · **Branch**: `claude/spec-kit-integration-juhrza`
**Commit**: `965a747` · **Run**: 59 (`34397274341`) · **Task**: T216

## The result

**Every step green, end to end.** The job's own conclusion is `success`, which the
runner only reaches by passing all 34 journeys AND every post-journey server
check. Its closing line:

    PASS: the real APK ran on Android, exercised the real API, and completed the journeys.

The emulator booted in 63 seconds (19:55:17 → 19:56:20), drove for 46 minutes,
dropped no device and retried nothing.

## What only a device could say

Read through the SERVICE, never the view hierarchy. These are the lines that did
not exist in any earlier run, each one a story's whole premise:

| Line | Story |
|---|---|
| `PUT /v1/posts/:postId/dismiss` 204 | US12/FR-041 — the feed stops choosing a post |
| `PUT /v1/people/:handle/mute` 204 | US12/FR-039 — less of a person, without blocking |
| `PUT /v1/me/follow-requests/:handle` 204 | US13/FR-045 — a request queue that can be answered |
| `POST /v1/appeals` 201 | US14/FR-047 — an appeal against a notice |
| `POST /v1/me/collections` 201, `PUT .../posts/:postId` 204 | US15/FR-051 |
| `POST /v1/me/drafts` 201 | US11 |
| `PATCH` and `DELETE /v1/posts/:postId/comments/:commentId` | US8 |
| `GET /v1/search/posts` 200 ×11 | US6 |
| `GET /v1/me/moderation-notices` 200 ×3, `GET /v1/me/appeals` 200 ×2 | US14 |
| `GET /v1/feed/following` 200 ×34 | US3 |
| `POST /v1/media/uploads` 201 ×19 | US1's multi-photo publish |

**FR-040 is why the aggregate matters more here than anywhere else.** Neither mute
nor dismissal may leave a trace on any screen — that is the requirement — so a
control that set a local flag and sent nothing would satisfy every visible
assertion in the flow. The two 204s are the only observation that can tell them
apart.

## It took four runs, and every one of the four failures was mine

Not one was the product.

| Run | Failed | Cause, measured | Where it was settled |
|---|---|---|---|
| 56 | (cancelled) | Maestro wedged in `30-edit-delete-comment`; the job's `timeout-minutes: 90` killed the step 47 minutes later | its own log |
| 57 | `33-mute-and-dismiss` | `mute-person` at y=676 on a 616pt screen — `assertVisible` does not scroll | browser at 320×616 |
| 58 | none — 34/34 flows | the post-journey place check asks ANONYMOUSLY, and `34` had left the account private | the check's own failure |
| 59 | none | — | — |

Runs 12, 23 and 33 had failed in run 55 with **no established cause**, and all three
were settled without spending a run on any of them:

- **`33` never left post detail.** The safety sheet is a pushed screen whose
  `onDone` is `pop`, so dismissing returns to post detail — and the flow then
  waited sixty seconds for a feed card. `post-<ULID>` is a testID on `PostCard`
  and `PostTile`; the detail screen renders neither, so there was never anything
  to find. `browser/mute-and-dismiss-journey.spec.ts` counts zero of them in 3.1
  seconds.
- **`12` asserted a post 466 points below the fold.** The interest space is
  recency-ordered and this account publishes into the same interest in `04` and
  `10` first, so the fixture's post is third: y=1082, caption y=1382, on a 616pt
  screen.
- **`23` was a margin, and that is all this record claims.** `MediaPager` is a
  `pagingEnabled` ScrollView with a 288pt pitch, so a release advances only past
  144 — and an element-relative swipe travels from the pager's centre to about
  its edge, which is 144. Exactly the threshold is where pass, fail, pass, fail
  lives. **No swipe of this flow has ever been watched**, so the cause is not
  claimed; the swipe is now 256 points, past 144 and short of the 432 that would
  reach page 2.

## Two findings worth more than the runs they cost

**Run 56: the evidence added to make failures visible printed nothing, for the
first failure after it landed.** It lived after the journeys loop, and the loop
never finished. Evidence that only prints when a run finishes is evidence you may
not get — run 40's mistake in time rather than in space. `flow_evidence` is a
function called at the moment a flow fails now, and `maestro test` is bounded by
`timeout --kill-after=30s 480`, so a wedge costs one flow rather than the run and
the six flows behind it. **The wedge itself is not diagnosed**: 
`30-edit-delete-comment` passed in runs 52–55 and 57–59, and nothing in run 56's
log says what it was waiting on.

**Run 58 passed every flow and failed anyway, correctly.** `34-private-account`
turned the device's account private and left it there; the post-journey place
check asks with no token; a public post by a private account is evaluated by the
followers rule (FR-044). US13 working on a surface nobody had thought about it
on. It had been invisible for six runs, because the journeys block exits on the
first failed flow and that check had not run since run 51. The flow puts the
account back now — a toggle is not idempotent and flows share ONE SERVER, which
is 005/J-20 in a new place — and that buys FR-043's other direction the way
`27-set-avatar` covers set AND removed. The anonymous check is the assertion for
it: it cannot pass while the account is still private.

## A miscount of my own, corrected

I reported run 57 as **"35 of 36"**, including in commit `acab702`'s message. It
was **33 of 34**. There are 34 flows, not 36 — `05` and `07` do not exist — and I
read the denominator off the highest flow NUMBER instead of counting the files.
CLAUDE.md already records this exact habit from run 50 ("I first reported it as
'22 of 24' WITHOUT COUNTING THE FLOWS"), which is the second time it has caught
me and the reason it is written down again here.

The same error is in the runs 52–55 table: its `/36` denominators are wrong.
Counted from git at each run's commit, `.maestro` held 33 flows at `8c3ec91`
(run 53) and 34 at `e3d1727` and `d9151fc` (runs 54, 55). Run 52's row reports
`32/34` against 30 files at `231c71a`, which I cannot reconcile and am therefore
leaving marked as reported-at-the-time rather than silently adjusting.

## Still not verified, and reported that way

- **SC-017's font half.** Every fit measurement in this feature — the compose
  fold, the safety sheet, the interest space — was taken in a browser, and
  react-native-web ignores the platform font setting. The SCREEN-SIZE half is
  closed; the 130%-text half is not, and has not been since 006.
- **A mention link's TAP on a device.** Android renders a nested `<Text>` as a
  span inside one TextView, so `mention-<handle>` has no node for Maestro to
  find. The link works — established in a browser — but the tap is uncovered.
- **`23-multi-photo-post`'s swipe cause.** A margin was widened; nothing was
  observed.
- **Run 56's wedge.** Undiagnosed, and the next run to hit it will print what was
  on screen.
- iOS, 002/SC-002 (10,000 concurrent), real usage, and the datastore and hosting
  decisions are all unchanged by 008 and all still open.
