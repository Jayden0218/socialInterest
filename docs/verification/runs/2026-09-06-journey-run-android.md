# Journey Run — 2026-09-06 — tier B

Workflow run 11 (`android-emulator.yml`, run id 34019579571, head `61e2ec2`). Not edited after
the run.

| Field | Value |
|---|---|
| tier | `B` — through the app's own screens |
| runtime | `android-emulator` |
| device | Android 11 (API 30), `default;x86_64`, AVD `sih`, ubuntu-22.04 runner, KVM |
| version | `61e2ec2` |
| date | 2026-09-06 |
| evidence | `home.png` — 320x640, **515 distinct colours**, commonest covers 88.48%. Checked by `scripts/assert-screen-not-blank.mjs`, which passed |

## The app ran on Android. First time in this project's history.

```
Status: ok          LaunchState: COLD      TotalTime: 558
running as pid 2176
home.png: 320x640, 515 distinct colours, commonest covers 88.48%
OK: the capture shows a rendered screen.
-- visible text --
   Unauthorized
   New post
   Sign in
   Feed
   Discover
   Activity
   You
API served:
      1 "method":"GET","path":"/v1/feed/home"
      1 "method":"GET","path":"/v1/interests"
```

Three things are established that were open for the whole of features 002 and 003:

1. **The app renders on Android.** Not a black screen: 515 distinct colours, and the shell's
   own text — the four tabs, the compose affordance, the sign-in affordance.
2. **It talks to the service from the device.** The API's own request log shows
   `GET /v1/feed/home` and `GET /v1/interests` arriving from the app. That also confirms the
   `usesCleartextTraffic` fix: without it the platform would have refused every one of these
   before they reached the network.
3. **No crash or unhandled rejection** in the app's own log.

`SC-002` — "at least one non-blank capture of the app's own interface running on Android
exists" — is **met**.

## Results

One row per journey. Nothing is blank.

| Journey | Result | Note |
|---|---|---|
| J-01 sign in | **pass** (43s) | Through the screen, not by seeding a token |
| J-02 browse catalogue | **pass** (8s) | |
| J-03 follow an interest | **fail** | `interest-screen` not visible after tapping a search result. "Climbing" **is** seeded, so this is not missing data — cause not yet established |
| J-04 publish an image | **fail** | `compose-screen` not visible. **Cause known**: 003/T038 put the media picker first and this flow was not updated |
| J-05 publish a video | not run | No video fixture is pushed to the device |
| J-06 home feed | **pass** (45s) | |
| J-07 interest space | not run | Part of J-03, which did not reach it |
| J-08 comment | **fail** | Same cause as J-04 — it `runFlow`s it |
| J-09 report | **fail** | Same cause as J-04 — it `runFlow`s it |
| J-10 block | not run | Part of 09, which did not reach it |
| **FR-033 / Principle I** | **pass** (1m) | `12-interest-follow-does-not-widen`: followed the author by tapping Follow, then confirmed their post in an unfollowed interest is absent from the feed — **on a device** |
| 10 publish from library | **fail** | `media-continue` not found after selecting from the gallery. Cause not yet established |
| 11 permission refused | **fail** | `library-permission-denied` not visible. Cause not yet established |
| N-01 … N-04 | not run | Driven over HTTP by `apps/e2e`, not by Maestro |

**4 of 10 flows passed.** `6/10 Flows Failed`, per Maestro's own summary.

## What is fixed, and what is only observed

**Fixed, cause certain from the evidence** — three of the six failures, one cause:
`04-publish-image.yaml` tapped `open-compose` and expected `compose-screen`. 003/T038 made
compose open the media picker first. The jest navigation test was updated for that; these
flows were not, and nothing could catch it until a device existed to run them. `08-comment`
and `09-report-and-block` both `runFlow` the publish flow, so they failed for the same reason.

**Not fixed, and deliberately not guessed at** — J-03, flow 10 and flow 11. Maestro's summary
names the failed assertion but not the step the flow reached, so there is not yet enough to
say why. The junit report does carry that, and the device pass now prints it into the job log
rather than only uploading it — an artifact on a host this sandbox cannot reach is not
evidence. The next run says where each failed.

Plausible readings exist for all three. None is recorded here, because a plausible reading
written down becomes a fact somebody acts on, and this project has retracted one of those
already.

## Limits on this record

- It is an **emulator**, not hardware. Constitution Principle V: this is not evidence about a
  production path, and it cannot see what only real hardware exposes — camera capture, real
  network conditions, vendor OS behaviour, battery or thermal effects.
- **iOS is not covered at all.** Unverified, not "probably fine".
- **J-05 is `not run`**, never `pass`: no video fixture reaches the device.


---

# Update — run 16 (id 34024543498, head `17e1008`), and a hard stop after it

## Results

| Journey | Result | Note |
|---|---|---|
| J-01 sign in | **pass** | |
| J-02 browse catalogue | **pass** | |
| J-03 follow an interest | **fail** | The tap on a search result did not navigate — the search screen was still visible afterwards. **The app is not at fault**: a container test drives the same press through the shell and the interest screen opens. Device tap landing; `hideKeyboard` added, unverified |
| J-04 publish an image | **fail** | Reached compose, published (`POST /v1/posts` **201** in the API log), did not return to the feed within the assertion window. Explicit wait added, unverified |
| J-05 publish a video | not run | No video fixture |
| J-06 home feed | **pass** | |
| J-07 interest space | not run | Part of J-03 |
| J-08 comment | **fail** | Same cause as J-04 |
| J-09 report | **fail** | Same cause as J-04 |
| J-10 block | not run | Part of 09 |
| FR-033 / Principle I | **pass** | Followed by tapping, then confirmed the unfollowed-interest post is absent |
| 10 publish from library | **fail** | The app hands off to `com.android.documentsui` — **Android's own file picker** — which showed "No items". `media-continue` was behind another app's window |
| 11 permission refused | **fail** | On API 30 the picker needs no storage permission, so denying produces no refusal and the banner correctly never appears |

**4 of 10 passed.** `POST /v1/posts` reaching 201 is the run's real result: media uploads
from the device and publishing works, which needed both the presigned public endpoint and the
runner's loopback alias.

## What is verified about US4, precisely

- **Verified**: the compose flow hands off to the device's own media library.
- **NOT verified, and recorded as `not run`**: that an image chosen from a populated gallery
  publishes. The test image is in MediaStore, but DocumentsUI's Recent view does not surface
  adb-pushed files, and reaching it would mean driving Google's own navigation — a journey
  that breaks when Google changes it, for reasons that say nothing about this product.
- **NOT verifiable on this device**: FR-012's refusal path. The picker needs no storage
  permission on API 30, so there is nothing to refuse. The branch is covered by a container
  test instead, and the device flow asserts the requirement that does hold — the app must not
  proceed into compose with media the person never chose.

## Stopped: the Actions allowance is exhausted

Run 17 and two CI builds failed **six seconds after being created**, with no step run:

```
The job was not started because recent account payments have failed or your
spending limit needs to be increased. Please check the 'Billing & plans'
section in your settings
```

That is an account limit, not a code failure, and it blocks **all** workflows on this
repository — the ordinary CI build as well as the emulator job. No further evidence can be
gathered until the owner raises the Actions spending limit or the monthly allowance resets.

**The fixes made after run 16 are therefore unverified**: `hideKeyboard` for J-03, the
explicit feed waits for J-04/08/09, and the rewritten flows 10 and 11. They are reasoned from
run 16's captured evidence, they pass every local check, and **no run has executed them**.
They must be reported that way rather than as fixes that worked.


---

# Update — run 18 (id 34026697429, head `735f289`)

The repository was made public, which restored GitHub-hosted Actions minutes. This is the
first run to execute the five flow fixes that were pushed after run 16 and recorded as
unverified. **All five worked.**

| Journey | Result |
|---|---|
| J-01 sign in | **pass** |
| J-02 browse catalogue | **pass** |
| J-03 follow an interest | **pass** — `hideKeyboard` fixed it, and the API log confirms real navigation: `GET /v1/interests/:interestId` 200 and `GET /v1/interests/:interestId/posts` 200, neither of which appeared in any earlier run |
| J-04 publish an image | **fail** — `home-feed-screen` not visible |
| J-05 publish a video | not run |
| J-06 home feed | **pass** |
| J-07 interest space | **pass** — reached via J-03 |
| J-08 comment | **fail** — same as J-04, which it runs |
| J-09 report | **fail** — same as J-04, which it runs |
| J-10 block | not run |
| FR-033 / Principle I | **pass** |
| 10 publish from library | **pass** — the hand-off to the device's own library is verified |
| 11 permission refused | **pass** — asserting the requirement that holds on this platform rather than one it cannot produce |

**7 of 10 passed**, up from 4.

## The three remaining failures are one failure

All three are `04-publish-image`; `08` and `09` run it. The API log for the whole run is the
useful part: **three flows reached publish and exactly one `POST /v1/posts` was logged.**

So the app is not failing to navigate after publishing — publishing itself is not completing
in two of three attempts, and `assertNotVisible: compose-error` passes throughout because no
error is ever shown. The request appears simply not to resolve.

That is a hypothesis, and it is not recorded as the cause. What run 18 established is that
`home-feed-screen is not visible` covers at least three different situations, and the flow
could not tell them apart. It now separates them:

1. still on compose after 30s — publish never resolved;
2. `load-error` visible — the feed request rejected, which an assertion looking only for the
   feed cannot see;
3. neither — a genuinely missing feed screen.

The next run says which.

## Not verified, still

- **J-05 publish a video** — no video fixture reaches the device.
- **An image chosen from a populated gallery** — flow 10 verifies the hand-off to
  `com.android.documentsui`, not a round trip through it.
- **FR-012's refusal path on a device** — not producible on API 30; covered by a container test.
