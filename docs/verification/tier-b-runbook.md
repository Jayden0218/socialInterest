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
