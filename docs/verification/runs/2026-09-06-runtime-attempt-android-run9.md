# Runtime Attempt — 2026-09-06 — run 9

Workflow run 9 (`android-emulator.yml`, run id 34014321862, head `684de91`). Not edited after
the attempt.

| Field | Value |
|---|---|
| date | 2026-09-06 |
| configuration | `system-images;android-30;default;x86_64`, AVD `sih`, `-no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim -partition-size 2048 -verbose`, runner `ubuntu-22.04` |
| outcome | **`booted`** — the runtime started; the APP did not survive launch |
| runtime_output | Below |
| conclusion | Below |

## What succeeded, and what it settles

Every step up to and including the emulator boot passed:

- `db:create-local` **succeeded**. This is the step run 8 hung on for over an hour; the
  DynamoDB volume-ownership fix is confirmed in CI, not only locally.
- The API booted with a per-run generated `LOCAL_JWT_SECRET`, so removing the published
  default did not break the workflow.
- The APK built at 21.6 MB **with the native image picker linked** — the first Gradle build
  including a native module added by 003/US4.
- The emulator booted, for the second time. `KVM (version 12) is installed and usable`.
- `adb` resolved from the SDK, fixing run 7's failure:
  `[device-pass] adb resolved to: /usr/local/lib/android/sdk/platform-tools/adb`
- **The APK installed and launched**: `Performing Streamed Install / Success`, then
  `Events injected: 1`.

## What failed

```
== the process must still be alive: a crash on launch exits here ==
[device-pass] FAILED at line 72 (exit 1): pid=$(adb shell pidof "$PKG" | tr -d '\r')
```

25 seconds after launch, `app.socialinterest` was not running.

## Conclusion — what the output supports, and what it does not

**Supported**: the app does not survive launch on Android. It installs, it is started, and it
is gone 25 seconds later.

**NOT supported: any statement about why.** No crash log was captured, and that is a defect in
the harness rather than a property of the app. `pidof` exits 1 when nothing matches, so under
`set -e` the script aborted **at the assignment** — before the branch that dumps logcat could
run. The diagnostic written to explain this exact failure was made unreachable by the way the
failure was detected.

This is the fourth time in this project that a failure has been iterated on without being
observed. It gets the same treatment as the emulator did: make it visible first, change
nothing else on a guess.

## Two harness defects fixed, neither a hypothesis about the app

1. **The crash log is now captured unconditionally**, before any assertion, and the liveness
   check no longer aborts the script. On failure it prints the fatal entries *and* the tail of
   logcat regardless of whether anything matched.

2. **The reachability probe was meaningless.** It printed
   `connect: Network is unreachable` — against an API that was up and serving. The emulator's
   shell user cannot open a raw socket, so ICMP says that whether or not the host is reachable.
   A probe that reads the same on success and failure invites blaming the network for an
   unrelated fault. It is a TCP connect to port 3000 now.

Evidence is also printed into the **job log** now, not only uploaded as an artifact: artifact
downloads are served from an Azure blob host this environment's egress policy denies, so an
uploaded artifact is unreadable from here. An unreadable artifact is not evidence.

## One certain defect found by reading the generated manifest

Separate from the launch failure, and **not** offered as its cause:

The release manifest carried no `usesCleartextTraffic` and no network security config. Since
Android 9 cleartext HTTP is blocked by default, so every request to
`http://10.0.2.2:3000/v1` would have been refused by the platform before reaching the network.
The journeys could not have passed even with the app running.

Fixed through `expo-build-properties` and **verified in the generated manifest**
(`usesCleartextTraffic="true"`). Worth noting: `android.usesCleartextTraffic` in the Expo app
config is accepted silently and does nothing — the first attempt used it, and checking the
manifest rather than trusting the field is what caught that.

## Status

**Android remains unverified.** The runtime boots; the app has never rendered a frame on it.
T013, T015 and T043 stay open. The next run will say why the app dies, whatever the reason —
which is more than any run so far could have done.
