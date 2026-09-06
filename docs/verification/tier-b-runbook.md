# Tier B — core journeys on a physical device

**This does not run in the cloud sandbox as configured** — but the reason is narrower
than first recorded here, and worth knowing.

Nothing connects *in* to the sandbox directly. A reverse tunnel is an *outbound*
connection though, and `cloudflared` runs there fine; it fails only because
`api.trycloudflare.com` is outside the environment's network allowlist. Raising the
environment to `Custom` network access with the tunnel hosts allowed would let a phone
on any network reach an API running in the sandbox.

Two easier routes exist, and either is preferable:

- **`claude --teleport <session-id>`** pulls the session onto your own machine, where the
  device already is. No tunnel, no configuration.
- **Same LAN**, as below.

Whichever route, the pass itself must happen on real hardware.

Tier A (`pnpm --filter @sih/e2e test`) already drives the app's data layer over
real HTTP on every change. Tier B exists for what only hardware exercises:
permissions prompts, the camera and photo library, real network conditions,
background suspension, and the rendered UI itself.

## Setup

```bash
docker compose up -d
pnpm --filter @sih/infra db:create-local
pnpm --filter @sih/infra s3:create-local
pnpm --filter @sih/infra seed:catalogue
pnpm --filter @sih/api dev                       # binds 0.0.0.0:3000

# The device must reach your machine, so use its LAN address, not localhost.
EXPO_PUBLIC_API_BASE_URL=http://<your-lan-ip>:3000/v1 pnpm --filter @sih/mobile start
```

Open the dev build on one iOS and one Android device on the same network.

## What to walk

Every journey in `specs/002-production-readiness/contracts/e2e-journeys.md`:
J-01 to J-10, then N-01 to N-04 where a device can express them.

Pay attention to the things Tier A cannot see:

- the photo-library and camera permission prompts, including **refusing** them
- publishing a video shot on the device, not a fixture
- backgrounding the app mid-upload and returning
- a slow or dropped connection during publish - the retry path (FR-008) should
  not require re-selecting the media
- whether a failed load renders its error rather than an empty state

## Recording the result

Copy `runs/TEMPLATE-journey-run.md` to `runs/<date>-tier-b-<platform>.md`, fill in
the device and the commit, and mark every journey pass, fail, or **not run**.
Never leave a row blank, and never record a simulator pass as tier B - the
permissions and hardware paths are the entire reason this tier exists.

## What the browser journeys cover, and what they do not

`apps/e2e/browser/` renders the app's real screens in Chromium against a running
API (002/T102). It closes one specific gap: the UI had never rendered against a
live server, so a container binding the wrong field - or showing an empty state
for a failed load - passed both the 31 render tests and the 22 HTTP journeys.

**It is not a device test and must never be recorded as this tier.** Absent from a
browser entirely:

- permission prompts, including refusing them
- the camera and the photo library
- backgrounding mid-upload and returning
- real network conditions on a real radio
- anything platform-specific about how the OS treats the app

Those are the whole reason Tier B exists. A green browser suite says the UI and
the service agree; it says nothing about any of the above.

## Building the Android APK (verified 2026-09-05, in the cloud sandbox)

The whole toolchain runs in a cloud session once the environment's network access
allows `dl.google.com` and GitHub. No Expo account and no EAS needed.

```bash
# 1. Native project (regenerated whenever app.config.ts changes)
pnpm --filter @sih/mobile exec expo prebuild --platform android --no-install

# 2. Android SDK
mkdir -p /opt/android-sdk/cmdline-tools && cd /opt/android-sdk/cmdline-tools
curl -sLO https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip -q commandlinetools-linux-*.zip && mv cmdline-tools latest
export ANDROID_HOME=/opt/android-sdk PATH=$PATH:/opt/android-sdk/cmdline-tools/latest/bin
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"

# 3. JDK 17. Gradle requires 17; the image ships 21, and Gradle's own toolchain
#    download is blocked by the egress proxy (foojay). Fetch Temurin from GitHub.
curl -sL -o /tmp/jdk17.tar.gz \
  https://github.com/adoptium/temurin17-binaries/releases/download/jdk-17.0.13%2B11/OpenJDK17U-jdk_x64_linux_hotspot_17.0.13_11.tar.gz
mkdir -p /opt/jdk17 && tar xzf /tmp/jdk17.tar.gz -C /opt/jdk17 --strip-components=1

# 4. Build. arm64-v8a only, release: a debug APK with every ABI is 104 MB,
#    arm64 debug is 35 MB, arm64 release with R8 is 20 MB.
cd apps/mobile/android && echo "sdk.dir=/opt/android-sdk" > local.properties
JAVA_HOME=/opt/jdk17 PATH=/opt/jdk17/bin:$PATH \
EXPO_PUBLIC_API_BASE_URL=http://<reachable-host>:3000/v1 \
  ./gradlew assembleRelease --no-daemon -PreactNativeArchitectures=arm64-v8a \
    -Dorg.gradle.java.installations.paths=/opt/jdk17
# -> app/build/outputs/apk/release/app-release.apk
```

**The API URL is compiled in.** `EXPO_PUBLIC_API_BASE_URL` is inlined at build
time, so an APK built with one address cannot be repointed. Build it with an
address the device can actually reach: a LAN address for a phone on your network,
or a public URL for a cloud device farm.


---

## Tier B on a cloud device (added 2026-09-06)

The owner's decision on 2026-09-06 is that a **cloud device is acceptable** for
T045 in place of a phone in someone's hand. What follows is that route. Read the
limits at the end before recording a pass from it.

`.github/workflows/android-emulator.yml`, `workflow_dispatch` only. One runner
holds the emulator *and* the API, so the app reaches the server on `10.0.2.2` -
the emulator's alias for the host loopback. No inbound route, no tunnel, no
allowlist entry, no public deployment. That is the whole reason this works where
a physical phone would need a hosted API first.

### The two things that are easy to get wrong

**The emulator BOOTS. Run 7 (2026-09-06) booted it in 77 seconds**, with
hardware acceleration confirmed by the emulator itself — `KVM (version 12) is
installed and usable` — rather than inferred from the udev step exiting 0. The
Runtime Attempt with its output is
`docs/verification/runs/2026-09-06-runtime-attempt-android.md`.

Six earlier runs failed, and none of the five explanations offered for them was
right. The cause was **disk space**:

```
FATAL | Not enough space to create userdata partition.
        Available: 6278.66 MB, need 7372.80 MB.
```

The emulator wants ~7.4 GB for userdata and checks *after* the SDK install, the
Gradle build and the Docker images have taken theirs. It is not launched in the
foreground, so that fatal exit surfaced only as a boot timeout with no device —
which is exactly what every one of those six runs looked like. The workflow now
frees ~7 GB first and `scripts/emulator-launch.sh` caps the partition at 2048M.

What actually found it was capturing the emulator's own output and reading it.
Nothing else had. One of the discarded hypotheses (the Ubuntu 24.04 AVD-path
bug, `actions/runner-images#11482`) had been written into project documentation
as established fact and had to be retracted.

**The app has still never rendered a frame on Android.** Run 7 failed one
second later, in `Drive the app`, and said why: `adb: command not found` —
`platform-tools` is not on the runner's PATH, and the driver script called
`adb` bare while `emulator-launch.sh` had always used the SDK path. Fixed. The
journeys below are written, their selectors are checked against the app by
`scripts/verify-maestro-ids.mjs` on every CI run, and **they have not yet been
executed on a device**.

**The identity has to be provisioned, not just signed.** The local profile has
no signup endpoint. A correctly signed token whose profile row does not exist
gets `404 No such person` from `GET /v1/me`, so sign-in fails on the device.
`apps/api/scripts/mint-device-token.ts` writes the row through the API's own
`PersonRepository` and prints the token. In a hosted profile an identity
provider would do this.

### What the pass actually asserts

`scripts/android-device-pass.sh` fails unless all of it holds:

- the app process is alive after launch,
- the three tabs are really on screen,
- **the API's own request log shows a request that arrived from the app** - a
  blank screen renders three tabs too, so this is the assertion that separates a
  working app from a shell,
- logcat carries no fatal error,
- and the Maestro flows in `.maestro/` complete: sign in, browse the catalogue,
  follow an interest, publish, comment, report and block.

### Limits - state these on any run recorded from this route

- It is an **emulator**, not hardware. Constitution Principle V still applies:
  this is not evidence about a production path, and it cannot see anything that
  only real hardware exposes - camera capture, real network conditions, vendor
  OS behaviour, battery or thermal effects.
- **J-05 publish a video is not covered.** There is a native picker now
  (003/T037) and the gallery is seeded with a real image, but no video fixture
  is pushed. Record J-05 `not run`, never `pass`.
- **No journey has been run on a device yet.** Everything from "What the pass
  actually asserts" onward is written and statically checked, not executed.
  Record it that way until a run says otherwise.
- **iOS is not covered at all.** The Simulator is macOS-only and there is no
  macOS runner in this workflow.
