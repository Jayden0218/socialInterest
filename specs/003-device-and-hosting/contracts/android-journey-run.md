# Contract: an Android journey run

**Feature**: 003-device-and-hosting

What a run on an Android runtime must produce to count. The point of this contract is that a
run cannot pass by rendering something — 002 found eleven defects behind screens that rendered
perfectly — and cannot fail silently, which is how six emulator attempts produced no knowledge.

## The runtime attempt always reports

| | Requirement |
|---|---|
| On success | The runtime's own output is captured and uploaded |
| On failure | The runtime's own output is captured and uploaded, **and printed into the job log** |
| On timeout | As failure. The wait is bounded; exceeding it is a failure with output, not a hang |
| Never | A conclusion about why it failed that is not supported by the captured output |

A step that ends without the runtime's output is a defect in this contract, not a result.

## The app must be reached, not just installed

| Check | Passes when |
|---|---|
| Install | The package appears in the runtime's package list |
| Launch | The process is alive after launch — a crash on start is a failure, not a slow start |
| Render | A capture of the app's own interface exists and is **not blank**. The only Android capture in this project's history is entirely black; that is the artefact this check exists to reject |
| Reach the service | The service's own request log shows a request that arrived from the app. A blank screen renders tabs too — this is what separates a working app from a shell |

## Every journey asserts on the server, not the screen

Each journey drives the app's own screens and then confirms the effect **through the service**,
not through the interface that produced it.

| Journey | Confirmed by |
|---|---|
| Sign in | The service accepted the token; the signed-out affordance is gone |
| Browse the catalogue | Results the service returned are on screen |
| Follow an interest | The viewer's followed count, read back from the service |
| Publish | The post exists, readable by another identity once ready |
| Comment | The comment body, read back from the service |
| React | The reaction count and viewer state, read back from the service |
| Report | The report exists for moderation |
| Block | The block takes effect on a read surface immediately |
| Open a notification | Lands on the post it refers to — not an error |
| FR-033 negative case | A followed person's post in an unfollowed interest is **absent** |

A journey asserted only against the DOM or the view hierarchy does not satisfy this contract.

## Results are recorded honestly

- Every journey gets `pass`, `fail` or `not run`. Never blank.
- A journey not attempted is `not run`, never `pass`.
- `runtime` is `android-emulator`. **Neither `android-device` nor `ios` may be recorded by this
  feature** — it can produce neither.
- Browser results are never described as device verification, and Android results are never
  inferred from the browser build (FR-005).

## What this contract does not cover

Recorded on every run so a reader cannot mistake its scope: real hardware behaviour, camera
capture, real network conditions, vendor OS differences, battery and thermal effects, and iOS
entirely. An emulator answers native layout, touch dispatch, platform fonts and insets, and
real permission dialogs. It does not answer the rest, and Principle V still applies.
