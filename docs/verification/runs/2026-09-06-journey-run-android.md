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
