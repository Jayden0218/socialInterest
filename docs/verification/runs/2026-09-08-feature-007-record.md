# Feature 007 — ranked feed + redesign — verification record

**Date**: 2026-09-08
**Feature**: `specs/007-ranked-feed-redesign/` — the composed feed replaced by a
ranked one, and all twenty screens rebuilt against `design/007-ui/`
**Commit under test (local suites)**: `the branch head at the time of the last full run`
**Commit under test (device)**: `PLACEHOLDER_DEVICE`
**Cost**: zero. Everything ran on the `local` profile or on GitHub-hosted standard
runners, which are free on this public repository. No billable resource was
provisioned, and none was requested.

## What this feature changed, in one paragraph

The home feed no longer reads the viewer's subscribed interest partitions. It reads
across the catalogue, ranks candidates from the viewer's own behaviour, and hands
that set to `VisibilityFilter` — which still decides, per request, at read time. That
inversion is why the constitution was amended to 2.0.0 before any of it was written:
the composed feed satisfied Principle II **by accident**, because a candidate set
drawn only from subscribed partitions is already viewer-scoped whatever the ordering
does. A ranked feed removes the accident, so the boundary's position became a
contract with a build-failing guard behind it.

## Every criterion, and what measured it

| Criterion | Command that measured it | Result |
|---|---|---|
| **SC-001** — the feed moves toward an engaged interest and away from a skipped one | `pnpm --filter @sih/api test` → `tests/integration/ranked-feed.spec.ts` | **met** — as a GAP between the two interests, not an absolute position; see "a test that asserted noise" below |
| **SC-002** — a new account reaches a **populated** feed | `pnpm --filter @sih/e2e test` → `journeys/onboarding.spec.ts`, both variants (picks an interest, and skips) | **met as a path, NOT as a stopwatch** — see the limits section |
| **SC-003** — a person can find what their feed is built from, and clear it | `apps/e2e/journeys/signals.spec.ts`; disclosure renders from `RankingService.weightsFor`, the same weights the ranker reads | **met** |
| **SC-004** — no feed response is entirely one interest | `tests/integration/ranked-feed.spec.ts`, across repeated draws | **met** |
| **SC-005** — a post made private is absent from every surface, ranked feed included | `pnpm --filter @sih/api test` → `tests/visibility/matrix.spec.ts` + `surface-routing.spec.ts` | **met** |
| **SC-006** — a blocked person's posts appear zero times in the ranked feed | `tests/visibility/matrix.spec.ts`, and `tests/integration/ranking-boundary.spec.ts` C2–C5 | **met** |
| **SC-007** — one person's signals are not observable by another | `tests/integration/signals-hostile-client.spec.ts` — the five hostile-client paths in `contracts/signals.md`, not the app's own client | **met** |
| **SC-008** — four or more posts visible without scrolling on the shortest screen | `apps/e2e/browser/safety-fit.spec.ts`, at a fixed 360x640 viewport | **met** — four media boxes fully inside the fold, in two columns |
| **SC-009** — every interactive control meets 44x44, checked mechanically | `apps/mobile/src/__tests__/touch-target.test.tsx` | **met, and it was NOT met when the guard was first believed** — see below |
| **SC-010** — every control reachable at the largest font on the shortest screen | `apps/e2e/browser/safety-fit.spec.ts` (feed, explore, profile at 130% text on 640pt) and `signin-fit.spec.ts` | **met in a browser; NOT met as a claim about native font scaling** — see the limits section |
| **SC-011** — every existing test identifier still resolves | `node scripts/verify-maestro-ids.mjs` + `testid-snapshot.test.ts` | **met** |
| **SC-012** — feed first screen under 2s p95, ranking adding no more than 150ms | `pnpm --filter @sih/api bench:feed` | **met at the measured scale**: whole feed worst **p95 166.5ms** against a 2,000ms budget; ranking's own share **34.9ms**, about 20% of the request, against a 150ms budget |

### SC-012, stated precisely enough to be argued with

6,000 posts / 600 people / 300 interests, against **DynamoDB Local**, on this
sandbox. Not 001's 100k/10k scale, and not a provisioned datastore. Each sample is
taken twice against the same viewer — the whole request, then `RankingService.rank`
alone — so the difference is the visibility boundary plus hydration, which 001
already measured. What the figure supports is a narrow claim: **the ranker is not
where the time goes.** It says nothing about a hosted datastore, and 002/R1's
finding still stands that the emulator is the lowest ceiling in this stack by an
order of magnitude (882 req/s durable). **002/SC-002 remains unverified.**

## Criteria NOT met, and criteria met more narrowly than they read

- **SC-002 is a path, not a duration.** "Under 60 seconds from first launch" needs a
  person with a stopwatch. What is asserted is that every step of the path is
  populated and that no empty state appears on it — which is the more useful half
  anyway: an onboarding that reaches a feed in ten seconds *through an empty screen*
  has already told somebody the product is empty.
- **SC-010 is measured in a browser.** `zoom` is the browser's stand-in for the
  platform font setting and is not the same thing: react-native-web ignores the
  platform setting entirely. That is precisely why 006's overflowing `Avatar`
  initial could never have been caught there. Native font scaling is answered by the
  device run or not at all.
- **001/SC-011 — a video PLAYING on a device — is unchanged and still open.**
  `19-publish-video` asserts the poster frame renders after a real upload and
  transcode; it does not assert playback starts.
- **iOS: nothing has ever run.** The Simulator is macOS-only.
- **Real usage: nobody has used this product.** Retention, second-post rate and
  onboarding success are unanswered, and a script exercising those paths measures
  the script.
- **The datastore decision** (`003/datastore-decision.md`) is the owner's and remains
  recorded as pending.
- **There is still no production hosting story.** DynamoDB Local is a dev tool.

## The full CI step list, in order

Run as `.github/workflows/ci.yml` runs it, not a proxy for it — and `@sih/e2e` run
**alone**, because two concurrent jest invocations kill each other's API and produce
a page of `fetch failed` that reads like a product failure.

| Step | Result |
|---|---|
| `pnpm typecheck` | clean |
| `pnpm lint` | clean |
| `pnpm --filter @sih/api test` | **830 passed**, 50 suites |
| `pnpm --filter @sih/mobile test` | **188 passed**, 27 suites |
| `pnpm --filter @sih/workers test` | **6 passed** |
| `node scripts/verify-maestro-ids.mjs` | **161 selectors** across 20 flows resolve |
| `pnpm --filter @sih/shared generate:client` | no drift — the generated client matches the contract |
| `pnpm --filter @sih/e2e test` | **154 passed**, 27 suites |
| `pnpm --filter @sih/api smoke:boot` | 9 passed |
| `pnpm --filter @sih/e2e test:durability` | 4 passed |
| `pnpm --filter @sih/infra verify:stack` / `synth` / `pnpm verify:register` | clean |

## What the local suites could not have found, and the device did

**Five device runs are recorded, not one.** Four of the five failed, three of
those four were mine, and the fourth was a defect only a device could show. The
failures are the useful part of this record.

| Run | Result | What it established |
|---|---|---|
| 38 | failed at 29s | **Not the app.** The runner's smoke check asserted the literal text `Discover`; T055 renamed that tab's label to `Explore`. The screenshot showed the redesign working. The check asserts testIDs now — a label is copy, a testID is an interface. |
| 39 | 0/19 | The app was signed out for all twenty minutes. The API aggregate said so: `GET /v1/feed/home` **401 ×21**, and the only three `GET /v1/me` 200s were host-side fixtures. The sign-in submit button sat 19 points below the fold. |
| 40 | failed | Same defect. **And I could not say so**, because the evidence was unreachable — see below. |
| 41 | 0/19 | Same defect, and this time the log **named the step**: Maestro tapped `sign-in-token`, typed the token, and could not find `sign-in-submit` for 54 seconds. The button was under the soft keyboard. |
| 42 | PLACEHOLDER_42 | PLACEHOLDER_42_NOTE |

### The three things those four runs actually taught

**1. A guard containing an invented constant tests the constant.**
`signin-fit.spec.ts` was written after run 39, verified red against run 39's
exact numbers, and passed through runs 40 and 41 while the device failed
identically each time. It opened the page at 320x390 — "what is left of a 640pt
screen once a keyboard takes 250" — and checked the button against 390. **250
was invented.** react-native-web has no soft keyboard, so no browser measurement
can ever supply that number.

The fix stops needing it. The submit button is now ABOVE the field: a control
above the field cannot be covered by a keyboard that opens below it, at any
keyboard height, under `adjustResize` and `adjustPan` alike. That is an
invariant rather than another number to be wrong about.

**2. The rule is not "never put a submit below a field."** The comment and
message composers do exactly that and passed runs 34 and 37 — because each sits
under a `flex: 1` list that absorbs the keyboard resize, so the composer rides
up with the fold. Sign-in had no absorber: top-aligned content, fixed offsets,
so the keyboard simply covered whatever fell below it. **A screen with nothing
to absorb the resize cannot put a control where a keyboard can reach it.**

**3. Evidence you cannot get to is the failure runs 1-6 were spent on.**
CLAUDE.md calls the whole-run API aggregate "the single most useful artifact in
these runs; read it before forming a theory" — and it was printed FIRST in the
evidence step, above a logcat filter, a logcat tail, an emulator dump and
eighty-five resource rows that never move. Job logs come back only as a tail;
the artifact holding the same data is on a blob host this environment's egress
denies with a 403. Two tails, 380 lines, never reached it. That is why run 40 is
recorded as "failed, cause unknown" rather than given a story.

The aggregate and the flow results print LAST now, and go to
`$GITHUB_STEP_SUMMARY`; the resource samples are summarised to first, last,
extremes, and any sample where adb did not report `device`. **Run 41 named its
failing step in the first tail I took.**

### And one regression caught before a run found it

The T052 rebuild put a title header and a "SUGGESTED" row above the group search
results — on the one interaction that taps a result with the keyboard up.
Measured at 320x640: the layout that passed runs 34 and 37 had the second result
at 245-289; the rebuild had it at **358-402**. Recovered to 266-310 by merging
the title row into the name row and hiding an inaccurate label during a search.

The bound in the guard is **what a device demonstrably reached (289)**, not
"640 minus a keyboard". That distinction is the whole of lesson 1, applied
before it cost anything.

## Four defects, and not one was visible to a green suite

Recorded because each is a class of mistake rather than an incident.

1. **The app had never loaded a second page of anything.** `ApiPage<T>` declared
   `nextCursor` at the top level; every list endpoint nests it under `page`.
   `usePaged` read `undefined` and marked every list exhausted — feed, interest
   spaces, profiles, comments, notifications, five features deep. Every mobile test
   stubs the data layer, and **the stubs were wrong in exactly the same way the type
   was**: they agreed with each other and neither agreed with the server. Only a
   request found it.
2. **The feed crashed on its second render.** `FlatList` throws on a changed
   `onViewableItemsChanged`, and an inline arrow is a new identity every render. 165
   mobile tests were green — none renders a real `FlatList` — and every browser
   journey timed out with no reason given. Found in seconds by attaching a
   page-error listener.
3. **A viewer with nothing declared got an empty feed.** Exploration drew four random
   interests from a catalogue of hundreds, most holding no posts. Unit tests stub an
   index where every partition is populated, so the emptiness exists only against a
   real sparse catalogue.
4. **Every signals route answered 500, and 404 before that.** `@Controller('v1')`
   under a global `v1` prefix gives `/v1/v1/...`, and the caller was read from
   `req.user` — Passport's convention, not this app's. Invisible to typecheck, lint
   and `smoke:boot`, which checks other controllers.

## Three more, found after I had already reported the feature complete

These came out of the verification phase itself, which is the argument for
having one.

5. **Four Phase 5 tasks were never done, and I reported eight phases finished.**
   T051–T054 — nine screens: profile, edit profile, saved, inbox, conversation,
   new group, activity, compose, media picker — were still carrying 006's
   design. Every suite was green, because the screens *worked*; they were simply
   not the approved design. `tasks.md` said so the whole time, in four unchecked
   boxes. **A green suite says the code runs; the checklist says what was
   built.**
6. **"New followers" was a notification you could switch on that could never
   fire.** `follow` is a declared notification kind — the schema has it, the
   screen renders "X followed you", Edit profile offers the toggle — and
   `PersonFollowService` published no event, so `NotificationService` had
   nothing to subscribe to. Same family as 004/FR-031's message toggle,
   inverted: there the notification existed and the control did not.
7. **The follow hint on every profile described a withdrawn requirement.** It
   read "prominence inside interests you ALREADY follow (FR-033)" — the
   requirement 007 withdrew — so the app explained the composed feed to somebody
   using the ranked one. `screens.test.tsx` was pinning that exact sentence.

And one measurement that changed a screen: **delete-account ended at 788 points
on a 640-point screen.** Edit profile was taller than the shortest supported
phone, before this rebuild too, so two notification switches, the feed-signals
disclosure and account deletion were unreachable. It scrolls now — on that
number, with both of run 36's mechanisms answered rather than assumed away, and
with the guard verified red before it was kept.

## Guards whose first version was wrong, in an instructive way

- **The boundary contract compared two different draws.** It called
  `RankingService.rank` separately and compared to a separate HTTP response — but
  exploration re-samples per call, so the two sets simply differ and the comparison
  asserted nothing. The proposal is now intercepted inside the request that served it.
- **A privacy assertion written from its own prose.** It checked the victim's userId
  was absent from every surface and failed on `GET /people/:handle`, which returns
  that id because it is their profile. FR-013 protects what the SIGNALS say, not the
  existence of the person.
- **The dwell test captured `undefined`.** Reading `AppState.addEventListener.mock.calls`
  off a function that is not a mock under the RN preset delivered no background event,
  and reported the hook as broken when the test was.
- **The place-follow guard was reading the wrong file.** It guarded
  `feed.service.ts`, which no longer chooses candidates. Widened to `RankingService`
  and `CandidateSource`, verified red on a real import.
- **A test that asserted exploration noise.** SC-001's first version asserted an
  absolute position in the ranked list, which epsilon-greedy exploration is entitled
  to move. The gap between the engaged and skipped interest is the thing the
  criterion is about; the absolute half was dropped.
- **SC-009's guard approved the WORD `hitSlop`, not a size.** It skipped any
  `Pressable` whose tag mentioned it, so `hitSlop={{ top: 1, bottom: 1 }}` would have
  passed — the same shape as the mistake its own comment recorded one paragraph
  higher about approving a file rather than a control. It now names each slop-sized
  control with its box height and does the arithmetic. **That change immediately
  found a real gap**: the interest word's horizontal target was 20.7pt of text plus 8
  either side — **36.7, not 44** — under a comment claiming "44 in every direction".

## Two things I got wrong that cost a device run each

- **Run 38** failed 29 seconds in and the app was fine. The runner's smoke check
  asserted the literal text `Discover`; T055 renamed that tab's label to `Explore`.
  The screenshot showed the redesign working. A label is copy; a testID is an
  interface with a contract behind it, and the check asserts testIDs now.
- **Run 39** ran the full twenty minutes with the app signed out for every one of
  them. The evidence was the API aggregate, not a screenshot: `GET /v1/feed/home`
  **401 twenty-one times**, and the only three `GET /v1/me` 200s in the run were
  host-side fixtures. The submit button sat 19 points below the fold —
  `flexGrow: 1, justifyContent: 'center'` on a 96pt field, on a screen that
  deliberately does not scroll. Fixed by top-aligning, **not** by scrolling: run 36
  already established that turning `Screen`'s `scroll` on breaks sign-in on a device.
  `signin-fit.spec.ts` is the guard and was verified red against run 39's exact
  numbers — `Expected: <= 390, Received: 409`.

## The artifacts were re-checked against the build (T078)

Three claims in `data-model.md` and `research.md` matched no code: a partition key
prefix `PERSON#` that has never existed in this repository (it is `USER#`), sort keys
missing their leading `#`, and an "atomic add" on the signal profile that is a
read-modify-write and says so in its own repository comment. Somebody writing a query
from the data model would have written a key that returns nothing.
