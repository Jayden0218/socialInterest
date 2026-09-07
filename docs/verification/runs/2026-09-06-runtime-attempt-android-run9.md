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

## Addendum — what the published record says, and what it ruled out

Searched rather than guessed, then checked the claims against this project's own artefacts
instead of adopting them.

**The two most commonly cited causes do not apply here**, and both were eliminated for free by
unzipping the release APK rather than spending a run:

| Commonly cited cause | Check | Result |
|---|---|---|
| The JS bundle is missing from a release APK — `Unable to load script from assets 'index.android.bundle'`, the single most reported RN release-only crash | `unzip -l app-release.apk` | **Present**, 1,178,984 bytes. Not this |
| ABI mismatch — a release APK built for the wrong architecture | `unzip -l` | `lib/x86_64/` with 13 `.so` files, matching the emulator. Not this |

That is two plausible, symptom-matching explanations discarded before they could become a
seventh confident wrong answer. The published advice was right in general and wrong about this
project, which is the reason to check rather than adopt.

**One piece of published guidance did apply, and changes the harness.** Android's own tooling
documentation recommends `am start -W` for scripted launches; `monkey` is a pseudo-random
stress tester. `monkey` reports `Events injected: 1` whether the activity started, failed to
start, or started and immediately finished — which is precisely what run 9 printed and
precisely why it could not say which of those happened. `am start -W` blocks until the launch
completes and prints `Status:` / `Activity:` / `Error:`. The launch step now distinguishes
"never started" from "started and died".

Also from the same reading: crash entries land in logcat's `crash` buffer, which the default
buffer set can omit. Captures are `-b all` now, so a run cannot produce a clean-looking log
with the crash sitting in a buffer nobody read.

**Still not claimed: why the app dies.** The cleartext fix is a plausible candidate and is
deliberately not offered as the answer. The next run will report the launch status and the
crash buffer whatever happens, and the conclusion will be drawn from that.

### Sources

- <https://github.com/expo/expo/issues/22394> — Expo APK crashes on startup
- <https://docs.expo.dev/build-reference/troubleshooting/> — Expo build troubleshooting
- <https://github.com/facebook/react-native/issues/22076> — `index.android.bundle` missing in release
- <https://github.com/facebook/react-native/issues/28489> — release APK crash by CPU architecture
- <https://developer.android.com/studio/test/other-testing-tools/monkey> — Monkey is a pseudo-random stress tester
- <https://medium.com/androiddevelopers/testing-app-startup-performance-36169c27ee55> — `am start -W` for deterministic scripted launches
