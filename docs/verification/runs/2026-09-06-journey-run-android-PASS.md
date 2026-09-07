# Journey Run — 2026-09-06 — tier B — **all journeys passed**

Workflow run 25 (`android-emulator.yml`, run id 34033536386, head `6312fcc`). Not edited after
the run.

| Field | Value |
|---|---|
| tier | `B` — through the app's own screens |
| runtime | `android-emulator` |
| device | Android 11 (API 30), `default;x86_64`, AVD `sih`, ubuntu-22.04 runner, KVM |
| version | `6312fcc` |
| date | 2026-09-06 |
| evidence | `home.png`, asserted non-blank by `scripts/assert-screen-not-blank.mjs`; the job's own summary below |

```
10/10 Flows Passed in 8m 4s
PASS: the real APK ran on Android, exercised the real API, and completed the journeys.
```

## Results

| Journey | Result | Asserted through the service by |
|---|---|---|
| J-01 sign in | **pass** | `GET /v1/me` 200 — signIn stores the token only after the API accepts it |
| J-02 browse catalogue | **pass** | `GET /v1/interests` 200 |
| J-03 follow an interest | **pass** | `GET /v1/interests/:interestId` 200, `PUT /v1/interests/:interestId/follow` 204 |
| J-04 publish an image | **pass** | `POST /v1/media/uploads` 201 → `POST /v1/posts` 201, then the caption read back from `GET /v1/people/:handle/posts` |
| J-05 publish a video | **not run** | No video fixture is pushed to the device |
| J-06 home feed | **pass** | `GET /v1/feed/home` 200 |
| J-07 interest space | **pass** | `GET /v1/interests/:interestId/posts` 200 |
| J-08 comment | **pass** | `POST /v1/posts/:postId/comments` 201, `GET .../comments` 200 |
| J-09 report | **pass** | `POST /v1/reports` 201 |
| J-10 block | **not run** | See below |
| **FR-033 / Principle I** | **pass** | Followed a person by tapping Follow (`PUT /v1/people/:handle/follow` 204), then confirmed their post in an unfollowed interest is absent from the feed |
| 10 publish from library | **pass** | The hand-off to the device's own library (`com.android.documentsui`) |
| 11 permission refused | **pass** | The app does not proceed into compose with media the person never chose |

## What is deliberately NOT claimed

- **J-05 publish a video — `not run`.** No video fixture reaches the device.
- **J-10 block — `not run` on device, by choice.** A block severs follows and hides content
  for every later flow in the same suite, and `12-interest-follow-does-not-widen` depends on
  that author staying visible. Blocking is covered over HTTP by `apps/e2e`'s N-03, which
  asserts a blocked person's post is absent from every surface.
- **An image chosen from a populated gallery.** Flow 10 verifies the hand-off to Android's own
  file picker, not a round trip through it. DocumentsUI's Recent view does not surface
  adb-pushed files, and driving Google's navigation would be testing Google's app.
- **FR-012's refusal path on a device.** Not producible on API 30 — the picker needs no
  storage permission, so there is nothing to refuse. Covered by a container test.
- **iOS.** Never run. The Simulator is macOS-only.
- **Real usage.** Nobody has used the product.
- **A production datastore under load.** `002/SC-002` still needs provisioned infrastructure.

## Limits that still apply to this record

It is an **emulator**, not hardware. Constitution Principle V: this is not evidence about a
production path, and it cannot see what only real hardware exposes — camera capture, real
network conditions, vendor OS behaviour, battery or thermal effects.

## What it took: seven product defects, found only by running it

Nine runs separate the first green boot from this. Every failure that turned out to be real
was in the product, not the harness:

1. `expo-image-picker` installed with `pnpm add` took a version built against a newer
   `expo-modules-core` than SDK 54 ships. `NoClassDefFoundError` killed the app during module
   registration. **Use `expo install`.**
2. No `usesCleartextTraffic` — every request to `http://10.0.2.2:3000` refused by the platform
   before reaching the network.
3. Presigned upload URLs signed against the API's own S3 endpoint, `127.0.0.1:9000`, which
   inside the emulator is the DEVICE's loopback. Bytes had nowhere to go.
4. `runUpload` read a `data:` URI with `fetch(...).blob()`. Browsers resolve that; React
   Native does not. The upload never completed, so the publish button stayed disabled and
   tapping it was a silent no-op.
5. `sampleMedia.ts` declared `sizeBytes: 68` for 70 bytes of PNG — the app announced one size
   to the server and uploaded another.
6. The self profile tab passed the literal string `"me"` as a handle, so
   `GET /v1/people/me/posts` answered 404 and a person's own posts never loaded on their own
   profile — silently.
7. `PostQueryService.listByAuthor` returned VisibilityFilter's candidate rows as the response:
   `caption: null`, no media, no counts, no author. The fifth instance of that defect in this
   codebase.

Four of these were invisible to every test that existed, because the tests asserted shape
rather than content, or rendered a screen without checking anything called it.
