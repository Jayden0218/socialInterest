# Runtime Attempt — 2026-09-06

Filed from workflow run 7 (`android-emulator.yml`, run id 34007334219, head `fb41f50`).
Not edited after the attempt. Run 8 is recorded below it, in the same file, because it
never reached the runtime at all and so has no runtime output of its own to file.

## Attempt — run 7

| Field | Value |
|---|---|
| date | 2026-09-06 |
| configuration | `system-images;android-30;default;x86_64`, AVD `sih`, options `-no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim -partition-size 2048 -verbose`, userdata partition 2048M, runner image `ubuntu-22.04`, launched by `scripts/emulator-launch.sh` |
| outcome | **`booted`** |
| runtime_output | Below, verbatim from the job log |
| conclusion | Not required — the outcome is `booted` |

### `runtime_output`

```
[emulator-launch] started 2026-09-06T02:55:40Z
[emulator-launch] sdk=/usr/local/lib/android/sdk api=30 target=default abi=x86_64 avd=sih boot_timeout=900s
[emulator-launch] installing sdk packages
[emulator-launch] creating avd
[emulator-launch] userdata partition set to 2048M
[emulator-launch] disk free: 27042 MB
[emulator-launch] acceleration check
[emulator-launch] launching: emulator -avd sih -no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim -partition-size 2048 -verbose
[emulator-launch] emulator pid=3792
[emulator-launch] booted after 77s
[emulator-launch] outcome=booted exit=0
[emulator-launch] finished 2026-09-06T02:56:57Z
```

And from the following step, which is where the acceleration question is finally settled
by the emulator rather than inferred from the udev rule exiting 0:

```
== acceleration ==
accel:
0
KVM (version 12) is installed and usable.
```

### What this establishes

- **An Android runtime boots in this project's CI**, in 77 seconds, with hardware
  acceleration confirmed by the emulator itself.
- The `disk free: 27042 MB` line is the fix from T004–T006 working: the six failures in
  feature 002 were `Not enough space to create userdata partition. Available: 6278.66 MB,
  need 7372.80 MB` — a FATAL exit that surfaced only as a boot timeout.
- The five hypotheses offered across those six runs — the readiness probe, a heavy system
  image, the placement of the acceleration check, overridden emulator options, and the
  Ubuntu 24.04 runner image — were **all wrong**. One of them was written into `CLAUDE.md`
  as established fact and had to be retracted.

**It does not establish that the app runs.** Nothing had been installed at this point. No
journey ran, and no frame was rendered. Those are T009–T015 and remain open.

## What failed after it — run 7, `Drive the app`

The job failed one second after the emulator booted, and said why:

```
== the emulator must be able to reach the API on the host ==
./scripts/android-device-pass.sh: line 25: adb: command not found
== install ==
./scripts/android-device-pass.sh: line 29: adb: command not found
##[error]Process completed with exit code 127.
```

`ANDROID_SDK_ROOT` is `/usr/local/lib/android/sdk` on the runner, but `platform-tools` is
not on `PATH`. `scripts/emulator-launch.sh` never needed it to be — it calls
`"$SDK/platform-tools/adb"` by path — and `android-device-pass.sh` assumed the PATH the
launcher had already demonstrated it could not rely on. Fixed by resolving `adb` from the
SDK in the same way, with an explicit failure that lists the SDK contents if it is still
not found.

This is a supported conclusion, not a permitted one: the output names the missing command
and the line, and nothing else in the step had run.

## Attempt — run 8 (cancelled, no runtime output)

| Field | Value |
|---|---|
| date | 2026-09-06 |
| configuration | As run 7, head `e522ea8` |
| outcome | **`failed`** — cancelled before the runtime was reached |
| runtime_output | None. The emulator was never launched, so there is none to file |
| conclusion | Below |

Run 8 hung at step 9, `pnpm --filter @sih/infra db:create-local`, from 03:27:19 for over an
hour, and was cancelled rather than left to consume its 90-minute timeout.

The cause was found locally in the same session, and is not about Android at all. The named
volume added for US2 durability made DynamoDB Local unusable: the image runs as uid 1000
(`dynamodblocal`), Docker creates a named volume's mountpoint owned by root, and the process
could not open its SQLite file:

```
com.almworks.sqlite4java.SQLiteException: [14] unable to open database file
WARNING: [sqlite] SQLiteQueue[shared-local-instance.db]: stopped abnormally, reincarnating in 3000ms
```

It does not exit on that. It answers `400` to a bare `GET /`, which is exactly what the
workflow's readiness probe checks, and then hangs every real request forever — so the probe
passed and the next step waited for ever. Fixed by `user: root` on the service; verified by
writing an item, destroying the container, and reading it back.

**No conclusion about Android may be drawn from run 8.** It contains no evidence about the
runtime, because it never reached it.
