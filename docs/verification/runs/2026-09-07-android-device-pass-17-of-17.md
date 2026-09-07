# Android device pass — 17/17, runs 26–29

**Date**: 2026-09-07
**Workflow**: `.github/workflows/android-emulator.yml`, `workflow_dispatch`
**Runner**: `ubuntu-22.04`, KVM available (`/dev/kvm`, emulator reports hardware acceleration)
**Result**: **run 29 — 17 of 17 flows passed, every one on the first attempt, no device drops**
**Job**: <https://github.com/Jayden0218/socialInterest/actions/runs/34077736551>

This is the first run in which every Maestro flow in `.maestro/` executed and passed on a
real Android runtime. Runs 26–28 each found something, and none of the three found what I
expected it to.

## What actually ran (run 29)

```
[journeys] 17 flows, one Maestro session each
[journeys] PASS 01-sign-in                        [journeys] PASS 12-interest-follow-does-not-widen
[journeys] PASS 02-browse-catalogue               [journeys] PASS 13-send-message
[journeys] PASS 03-follow-interest                [journeys] PASS 14-message-request
[journeys] PASS 04-publish-image                  [journeys] PASS 15-attach-place
[journeys] PASS 06-home-feed                      [journeys] PASS 16-place-page
[journeys] PASS 08-comment                        [journeys] PASS 17-saved
[journeys] PASS 09-report-and-block               [journeys] PASS 18-notification-settings
[journeys] PASS 10-publish-from-library           [journeys] PASS 19-publish-video
[journeys] PASS 11-permission-refused
[journeys] passed 17/17
```

Boot: 61s. Journeys: 19m 9s. Whole job: 26m 44s.

## The effects, in the API's own log

A view assertion is satisfied by an optimistic render. These are the requests the server
actually served during the run — the whole run, aggregated, not a tail:

| Requests | What it proves |
|---|---|
| `POST /v1/posts` **201 × 8** | publishing works from the device |
| `POST /v1/media/uploads` **201 × 8** | presigned upload targets issued and used |
| `POST /v1/conversations/{id}/messages` **201 × 3** | 004/US1 — a message reaches the server |
| `POST /v1/conversations/{id}/accept` **204 × 1** | FR-003 — a request is accepted on device |
| `PUT /v1/conversations/{id}/read` **204 × 3** | read state is written, not just rendered |
| `POST /v1/places` **201 × 1**, `PUT /v1/places/{id}/follow` **204** | 004/US2 |
| `GET /v1/places/{id}/posts` **200 × 2** | the post landed at the place, asked of the server |
| `PUT /v1/posts/{id}/save` **204**, `GET /v1/me/saved` **200** | 004/US5 |
| `POST /v1/posts/{id}/comments` **201**, `POST /v1/reports` **201** | 001 engagement and safety |
| `PATCH /v1/me` **200** | 004/FR-031's preference write |

## Four runs, four findings

### Run 26 — the device died and nothing could say why

11/17 passed, then `15-attach-place` failed mid-`inputText`:

```
DeviceServerDiedException: Device server died during 'inputText' on emulator-5554
(2120ms since last byte, connection age 627143ms)
  Caused by: java.io.IOException: ... device offline
```

The five flows after it failed in **11–40 ms each** with `Launch app with clear state
FAILED` — collateral, not findings. qemu was still alive at job cleanup.

The evidence to explain it did not exist, for two reasons this repository had already
written down:

1. `logcat.txt` was captured **before** the journeys and never refreshed, so the
   "logcat (tail)" printed on failure was eleven minutes stale and described the app
   starting. It looked like evidence, which is worse than printing nothing.
2. `disk-free.txt` went into the **artifact**, and artifacts are served from a host this
   environment's egress denies.

### Run 27 — both suspects ruled out by measurement

Host disk and memory were the obvious causes. A 15-second sampler said otherwise:

```
ts        disk_avail_mb  mem_avail_mb  swap  qemu_rss_mb  adb_state
02:02:57  99893          11946         0     2612         device
   ...     flat           flat         0     flat         device
02:13:28  99871          11554         0     2726         device   <- last sample
```

Disk flat at ~99.8 GB free. Available memory flat at ~11.5 GB of 16. Swap zero throughout.
qemu RSS flat, no growth. `adb get-state` read `device` in the sample immediately before
the failure, and `qemu processes: 1` at the failure itself.

logcat, re-read **after** the journeys, showed the mechanism:

```
I adbd: host-13: read thread spawning
I adbd: host-13: already offline
I adbd: authentication not required
```

The guest's adbd re-handshook a fresh host connection, and logcat read fine seconds after
`adb get-state` had reported "no devices/emulators found". **The device drops off adb
transiently and comes back.** Nothing is exhausted and nothing crashes.

**Why adbd drops is still not established and is recorded here as unknown.** Writing a
plausible cause in from a matching symptom is how the Ubuntu 24.04 AVD-path explanation
became "established fact" in `CLAUDE.md` and had to be retracted.

What was fixed is the **cost**, which is a harness defect whatever the trigger:
`maestro test .maestro/` holds one device connection for the whole suite, so a momentary
drop at flow 12 takes out flow 12 and everything after it. Flows now run one Maestro
session each. The retry fires **only** on a device-transport error, never on an assertion —
verified by stubbing both cases.

### Run 28 — 15/17, and two real failures

`15-attach-place` passed. `08-comment`, `09-report-and-block`, `10-publish-from-library`
and `16-place-page` executed for the **first time ever**; they had been collateral in every
prior run. Two genuine assertion failures remained.

**1. 004/FR-031's message toggle did not exist in the UI.** `EditProfileScreen` kept a
private three-entry `CATEGORIES` list while `NOTIFICATION_CATEGORIES` has four: 004 added
`message` to the list that *describes* notifications, not the one that *renders the
switches*. The control the requirement is about was on no screen, on any platform, and the
requirement was recorded as met.

Same shape as the feed's second hand-rolled responder — with two lists for one thing, the
duplicate is not a risk of drift, it **is** the drift. There is one list now.

Nothing could see it: the mobile tests render the screen with props and assert what *is*
there. The existing preference test even passes a draft with all four keys and toggles
`reaction`, never asking whether the fourth switch rendered.

**2. `14-message-request` depended on running before `13-send-message`.** It waited for the
friend's seeded message text in the inbox; 13 replies into that same conversation, so the
row's preview correctly becomes the newer message. It passed in runs 26 and 27 purely
because Maestro happened to order 14 first. Sorting the flows made the coupling
deterministic, which is the useful half of sorting them. A last-message preview is mutable
by definition; the assertion now reads the participant's name.

### Run 29 — 17/17

## Guards added, each because the run found the mistake

- **`scripts/verify-maestro-ids.mjs`** no longer waves through a concrete id under a
  dynamic testID prefix. `pref-message` passed that check while the switch did not exist —
  the same hole that let `media-item-video` through. A plain-string selector now resolves
  against literals in the file that builds the id and the modules it imports **as values**;
  type-only imports are skipped, which is the whole check.

  Closing it took two attempts, and the second is the instructive one: the file I reverted
  to reproduce the defect still carried **my own comment** explaining that `message` was
  the fourth category, and that comment alone made the id resolvable. A guard that reads
  prose describes the intention, not the build. Comments are stripped now. Verified
  against the defect exactly as it shipped (`git show HEAD:…EditProfileScreen.tsx`): the
  check fails, naming the selector, and passes once the list is shared.

- **`screens.test.tsx`** asserts a switch exists for **every key the prefs object carries**,
  derived from the data rather than a hand-written list of four ids — which would pass
  today and miss the fifth exactly as this one was missed.

- **The resource sampler** runs for every pass, not only failing ones, so the next
  device-level failure is read off a timeline instead of reasoned about.

- **A service-side FR-031 check.** `18-notification-settings`' own header claimed the
  preference change was asserted server-side. It was not — the evidence was a
  `PATCH /v1/me` 200, and a switch bound to the wrong key sends a perfectly valid patch.
  The script now reads the value before and after and asserts it **changed**; asserting a
  hardcoded `false` would have been my bug, since a new person's prefs start empty and the
  toggle's direction is not knowable in advance.

## What this run does NOT establish

- **001/SC-011 is narrowed, not closed.** `19-publish-video` asserts the **poster frame**
  renders (FR-009) after a real upload and transcode. It does not assert that playback
  starts. A video *playing* on a device remains unverified.
- **iOS: nothing has ever run.** The Simulator is macOS-only.
- **002/SC-002 (10,000 concurrent) is unmeasured** and needs provisioned infrastructure.
- **Real usage is unanswered.** Nobody has used the product; a script exercising these
  paths measures the script.
- **Why adbd drops the connection is unknown**, and the per-flow structure limits the blast
  radius rather than removing the cause. Run 29 saw no drop at all, which is consistent
  with the cause being intermittent and is not evidence that it is gone.
- **The emulator is not a phone.** Hardware-accelerated x86_64 on API 30 is closer than a
  browser by a long way, and it is still not a device in someone's hand.
