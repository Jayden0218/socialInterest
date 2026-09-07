#!/usr/bin/env bash
#
# Runs on the host, against an emulator that is already booted, and drives the
# real APK against the real API. Called by the emulator runner's `script:`.
#
# The point of this file is that it fails loudly. A device pass that installs an
# app, sees nothing, and exits 0 is the exact shape of test that let five defects
# through in feature 001 - so every check below asserts on content, not shape.
set -euo pipefail

# Everything this script prints goes to a file that is uploaded with the run.
# The emulator taught this the hard way: a step whose output is not captured
# fails identically for every possible reason, and six runs were spent guessing
# at one. The ERR trap names the line, so a failure here says where it was.
OUT="${OUT:-artifacts/android-device-pass}"
mkdir -p "$OUT"
exec > >(tee -a "$OUT/device-pass.log") 2>&1
trap 'rc=$?; echo "[device-pass] FAILED at line $LINENO (exit $rc): ${BASH_COMMAND}"; exit $rc' ERR
echo "[device-pass] starting $(date -u +%FT%TZ)"
echo "[device-pass] ANDROID_HOME=${ANDROID_HOME:-unset} ANDROID_SDK_ROOT=${ANDROID_SDK_ROOT:-unset}"
echo "[device-pass] adb: $(command -v adb || echo 'NOT ON PATH')"
echo "[device-pass] apk: $(ls -l apps/mobile/android/app/build/outputs/apk/release/app-release.apk 2>&1 | tail -1)"

PKG=app.socialinterest
APK=apps/mobile/android/app/build/outputs/apk/release/app-release.apk

# Resolve adb from the SDK, exactly as scripts/emulator-launch.sh does.
#
# Run 7 booted the emulator in 77s and then died here in under a second:
#
#   ./scripts/android-device-pass.sh: line 25: adb: command not found
#
# The runner has the SDK at /usr/local/lib/android/sdk, but platform-tools is
# not on PATH - and the launcher never needed it to be, because it calls
# "$SDK/platform-tools/adb" by path. This script assumed the PATH the launcher
# had already shown it could not rely on.
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/usr/local/lib/android/sdk}}"
if [ -x "$SDK/platform-tools/adb" ]; then
  PATH="$SDK/platform-tools:$PATH"
  export PATH
fi
command -v adb >/dev/null || {
  echo "[device-pass] adb is not on PATH and not at $SDK/platform-tools/adb."
  echo "[device-pass] Contents of $SDK:"; ls -1 "$SDK" 2>&1 || true
  exit 1
}
echo "[device-pass] adb resolved to: $(command -v adb)"
adb version | head -1

# How did this boot? The sandbox proved TCG cannot run Android at all, so if a
# run is slow or unstable the first question is whether acceleration engaged.
# Non-fatal: this reports, it does not gate.
echo "== acceleration =="
"${ANDROID_HOME:-$ANDROID_SDK_ROOT}/emulator/emulator" -accel-check || true

# There is deliberately NO reachability probe here any more.
#
# Two were tried and both were worthless. `ping` reports
# "connect: Network is unreachable" because the emulator's shell user cannot
# open a raw socket - it says that whether or not the host is reachable. Its
# replacement, a /dev/tcp connect, reports
# "can't create /dev/tcp/10.0.2.2/3000: No such file or directory" because
# Android's shell has no /dev/tcp at all. Both printed failure against an API
# that was up and serving, which is worse than silence: it invites blaming the
# network for an unrelated fault.
#
# The real reachability assertion is further down and is stronger than any
# probe: the API's OWN request log must show a request that arrived from the
# app. That is the question actually being asked, answered by the thing that
# would have to work anyway.

echo "== install =="
adb install -r -g "$APK"
adb shell pm list packages | grep -q "$PKG"

echo "== launch =="
adb logcat -c

# `am start -W`, not `monkey`.
#
# monkey injects a pseudo-random event stream and is a stress tester; it reports
# "Events injected: 1" whether the activity started, failed to start, or started
# and immediately finished. Run 9 printed exactly that and told us nothing. The
# Android tooling docs recommend `am start -W` for scripted launches precisely
# because -W blocks until the launch completes and prints a status block:
#
#   Status: ok            <- the activity actually started
#   Activity: app.socialinterest/.MainActivity
#   Error: ...            <- or it says why it did not
#
# So this distinguishes "never started" from "started and died", which is the
# exact question run 9 could not answer.
adb shell am start -W -n "$PKG/.MainActivity" 2>&1 | tee "$OUT/launch.txt"
if grep -qiE '^Error:|Error type' "$OUT/launch.txt"; then
  echo "FAIL: the launcher activity did not start"
  adb logcat -b all -d | tail -80
  exit 1
fi
sleep 25

# Captured BEFORE anything is asserted, so the evidence exists whatever happens
# next. Run 9 died on the liveness check below and produced no log at all: the
# dump lived inside the failure branch, and the script never reached it.
# `-b all`, not the default. The default buffer set can omit `crash`, which is
# exactly where FATAL EXCEPTION lands - so a run could capture a logcat that
# looked clean while the crash sat in a buffer nobody read.
adb logcat -b all -d > "$OUT/logcat.txt" 2>&1 || true

echo "== the process must still be alive: a crash on launch exits here =="
# `|| true` is load-bearing. `pidof` exits 1 when nothing matches, and under
# `set -e` that aborted the script AT THIS ASSIGNMENT - before the diagnostic
# below could run. So the one run that got this far reported "FAILED at line 72"
# and nothing about why the app was gone. The check that was supposed to explain
# the failure was unreachable because of how the failure was detected.
pid=$(adb shell pidof "$PKG" 2>/dev/null | tr -d '\r' || true)
if [ -z "$pid" ]; then
  echo "FAIL: $PKG is not running after launch"
  echo "-- fatal entries in logcat --"
  grep -iE "AndroidRuntime|FATAL EXCEPTION|Force finishing|died|beginning of crash" \
    "$OUT/logcat.txt" | tail -60 | tee "$OUT/crash.txt" || echo "(none matched)"
  echo "-- last 60 lines of logcat, whatever they are --"
  tail -60 "$OUT/logcat.txt" || true
  exit 1
fi
echo "running as pid $pid"

echo "== capture what is actually on screen =="
adb exec-out screencap -p > "$OUT/home.png"

# T010. A capture is only evidence if it shows something.
#
# The only Android capture in this project's history is entirely black - taken
# while the emulator was crashlooping and the app was not installed - and it was
# filed as evidence anyway. This asserts the image is a rendered screen rather
# than trusting that a file exists.
node scripts/assert-screen-not-blank.mjs "$OUT/home.png"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null
adb pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null
# Refreshed: the earlier capture covers a crash on launch, this one covers
# anything the app logged while rendering.
adb logcat -b all -d > "$OUT/logcat.txt"

visible() { grep -oE 'text="[^"]+"' "$OUT/ui.xml" | sed 's/text="//;s/"$//' | grep -v '^$'; }
echo "-- visible text --"; visible | sed 's/^/   /'

echo "== the shell must have rendered =="
grep -q 'app-root\|resource-id' "$OUT/ui.xml" || { echo "FAIL: no UI hierarchy dumped"; exit 1; }
for label in Feed Discover Activity; do
  visible | grep -qx "$label" || { echo "FAIL: tab '$label' is not on screen"; exit 1; }
done

echo "== the app must have TALKED to the API, not just rendered a shell =="
# A blank screen also renders three tabs. What distinguishes a working app is a
# request that reached the server, so assert on the server's own access log.
# LoggerMiddleware writes one JSON line per request: {"method":"GET","path":"/v1/..."}
if ! grep -qE '"path":"/v1/(feed|interests)' /tmp/api.log; then
  echo "FAIL: the API received no request from the app"
  echo "-- last 40 lines of the API log --"; tail -40 /tmp/api.log
  exit 1
fi
echo "API served:"; grep -oE '"method":"[A-Z]+","path":"/v1/[^"]*"' /tmp/api.log | sort | uniq -c

echo "== no crash or unhandled rejection in the app's own log =="
if grep -iE "FATAL EXCEPTION|Unhandled (JS )?Exception|ReferenceError|TypeError" "$OUT/logcat.txt"; then
  echo "FAIL: the app logged a fatal error"
  exit 1
fi

# ---------------------------------------------------------------------------
# The smoke checks above prove the app runs and talks to the API. They do not
# prove a person can do anything, which is what a Tier B pass is for. The
# journeys below drive the real UI: sign in, follow, publish, comment, report,
# block - the ones that were unreachable until the shell was wired.
# ---------------------------------------------------------------------------
echo "== install Maestro =="
curl -Ls https://get.maestro.mobile.dev | bash
export PATH="$PATH:$HOME/.maestro/bin"
maestro --version

echo "== mint a token the API will actually accept =="
# Same secret and issuer the API validates against. A journey that signed in
# with a token the API would reject, or that bypassed sign-in, would turn an
# auth defect into a green run.
TOKEN="$(npx tsx apps/api/scripts/mint-device-token.ts)"
[ -n "$TOKEN" ] || { echo "FAIL: could not mint a token"; exit 1; }
# A real two-hour credential, in a job log that is now world-readable. Nothing
# here prints it deliberately, but the failure paths dump a UI hierarchy and
# Maestro's own log, and "nothing prints it deliberately" is not a guarantee.
# ::add-mask:: makes GitHub redact it wherever it turns up.
echo "::add-mask::$TOKEN"

# T012. A Maestro selector that matches nothing does not fail as a name error -
# it fails as a timeout, twenty minutes into a run, indistinguishable from the
# app being broken. Six of these were wrong when the flows were first written.
# Checked here as well as in CI, because the flows and the app can drift apart
# between the two.
echo "== every Maestro selector must exist in the app =="
node scripts/verify-maestro-ids.mjs

# T014 / FR-033 / Principle I. Two people cannot be driven through one device's
# UI, so the fixture is seeded server-side and the ASSERTION happens in the app:
# a followed person's post in an unfollowed interest must not reach the feed.
echo "== seed the FR-033 fixture =="
FIXTURE="$(cd apps/e2e && E2E_BASE_URL=http://127.0.0.1:3000 npx tsx scripts/seed-fr033-fixture.ts "$TOKEN")"
echo "$FIXTURE"
PRESENT="$(echo "$FIXTURE" | sed -n 's/^PRESENT=//p')"
ABSENT="$(echo "$FIXTURE" | sed -n 's/^ABSENT=//p')"
AUTHOR="$(echo "$FIXTURE" | sed -n 's/^AUTHOR=//p')"
[ -n "$PRESENT" ] && [ -n "$ABSENT" ] && [ -n "$AUTHOR" ] \
  || { echo "FAIL: the FR-033 fixture did not print what the flow needs"; exit 1; }

# T040. Put a real image in the emulator's gallery.
#
# `adb push` alone is NOT enough: MediaStore indexes the gallery, and a file
# pushed straight into /sdcard is invisible to every picker until the media
# scanner has seen it (research R4). The broadcast is the whole point of this
# block - without it, 10-publish-from-library.yaml opens an empty gallery and
# fails as a missing element, which reads like a broken app.
echo "== place a test image in the device gallery =="
node -e '
  const fs = require("fs");
  // A real JPEG, not a renamed PNG: the picker reports a MIME type from the
  // file, and the server derives kind from its own upload record.
  const b = Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
    "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAQABABAREA/8QAHwAAAQUBAQEB" +
    "AQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1Fh" +
    "ByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZ" +
    "WmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG" +
    "x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn+iiiv/9k=",
    "base64");
  fs.writeFileSync("/tmp/sih-gallery.jpg", b);
'
adb push /tmp/sih-gallery.jpg /sdcard/Pictures/sih-gallery.jpg
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE \
  -d file:///sdcard/Pictures/sih-gallery.jpg
# Assert the scanner actually indexed it. A silent no-op here is exactly the
# failure this block exists to prevent, and it is cheap to check.
sleep 3
if ! adb shell content query --uri content://media/external/images/media \
     --projection _display_name 2>/dev/null | grep -q 'sih-gallery'; then
  echo "WARNING: the media scanner did not index the pushed image."
  echo "10-publish-from-library.yaml will open an empty gallery."
fi

# 004/US1. One device cannot drive two people, so the other participant is
# seeded server-side and the ASSERTION happens in the app - the same shape as
# the FR-033 fixture above, and for the same reason.
echo "== seed the conversation fixture (004/US1) =="
CHAT="$(cd apps/e2e && E2E_BASE_URL=http://127.0.0.1:3000 npx tsx scripts/seed-chat-fixture.ts "$TOKEN")"
echo "$CHAT"
REQUESTER="$(echo "$CHAT" | sed -n 's/^REQUESTER=//p')"
FRIEND="$(echo "$CHAT" | sed -n 's/^FRIEND=//p')"
REQUEST_BODY="$(echo "$CHAT" | sed -n 's/^REQUEST_BODY=//p')"
FRIEND_BODY="$(echo "$CHAT" | sed -n 's/^FRIEND_BODY=//p')"
[ -n "$REQUESTER" ] && [ -n "$FRIEND" ] && [ -n "$REQUEST_BODY" ] && [ -n "$FRIEND_BODY" ] \
  || { echo "FAIL: the conversation fixture did not print what the flows need"; exit 1; }

# 004/US2. The flow taps an EXISTING match rather than creating a place, because
# FR-014's requirement is that the match is offered before the create action.
echo "== seed the place fixture (004/US2) =="
PLACE="$(cd apps/e2e && E2E_BASE_URL=http://127.0.0.1:3000 npx tsx scripts/seed-place-fixture.ts "$TOKEN")"
echo "$PLACE"
PLACE_NAME="$(echo "$PLACE" | sed -n 's/^PLACE_NAME=//p')"
PLACE_LOCALITY="$(echo "$PLACE" | sed -n 's/^PLACE_LOCALITY=//p')"
PLACE_ID="$(echo "$PLACE" | sed -n 's/^PLACE_ID=//p')"
[ -n "$PLACE_NAME" ] && [ -n "$PLACE_LOCALITY" ] && [ -n "$PLACE_ID" ] \
  || { echo "FAIL: the place fixture did not print what the flows need"; exit 1; }

echo "== journeys =="
maestro test .maestro/ -e TOKEN="$TOKEN" -e PRESENT="$PRESENT" -e ABSENT="$ABSENT" \
  -e AUTHOR="$AUTHOR" \
  -e REQUESTER="$REQUESTER" -e FRIEND="$FRIEND" \
  -e REQUEST_BODY="$REQUEST_BODY" -e FRIEND_BODY="$FRIEND_BODY" \
  -e PLACE_NAME="$PLACE_NAME" -e PLACE_LOCALITY="$PLACE_LOCALITY" \
  --format junit --output "$OUT/maestro-junit.xml" \
  --debug-output "$OUT/maestro-debug" || {
    echo "FAIL: a journey did not pass"
    # Maestro's summary names the flow and the failed assertion but not the STEP
    # it reached. The junit report does, and it is the difference between "this
    # journey failed" and "it failed at step 7 of 12, here is what preceded it".
    # Printed, not merely uploaded: artifacts are served from a host the agent
    # sandbox's egress denies, so an uploaded report is unreadable.
    # The junit report names the failed assertion and NOT the step context - run
    # 12 proved that, so it is no longer the thing being relied on. Maestro's
    # debug output carries the VIEW HIERARCHY at the point of failure, which is
    # what actually answers "the assertion says this id was not visible; what
    # was on screen instead".
    echo "=============== maestro junit report ==============="
    cat "$OUT/maestro-junit.xml" 2>/dev/null || echo "(no junit report)"
    # Maestro's own log, filtered to the commands that FAILED and the element
    # tree at that moment. Run 13 printed 40 unfiltered lines per log file and
    # buried the flow summary under a quarter of a megabyte of INFO chatter -
    # the fix for an unreadable failure is not more output, it is less of the
    # right output.
    echo "=============== maestro: failed commands ==============="
    find "$OUT/maestro-debug" -name 'maestro.log' -exec \
      grep -hE 'FAILED|Assertion is false|Element not found|No visible element' {} \; 2>/dev/null \
      | head -40 || true
    echo "=============== the screen when it stopped ==============="
    # The device's own view of the final state, which needs no artifact.
    adb shell uiautomator dump /sdcard/fail.xml >/dev/null 2>&1 || true
    adb shell cat /sdcard/fail.xml 2>/dev/null \
      | grep -oE 'resource-id="[^"]*"|text="[^"]{1,50}"' | grep -v '=""' | sort -u | head -40 || true
    echo "==================================================="
    exit 1
  }

# ---------------------------------------------------------------------------
# Every journey's effect is asserted through the SERVICE, not the view
# hierarchy. A message rendered optimistically in a list satisfies any DOM
# assertion and proves nothing about delivery - and every one of the seven
# product defects the first Android run found was invisible to the view.
# ---------------------------------------------------------------------------
echo "== 004/US1: did the typed message actually reach the server? =="
if ! grep -qE '"method":"POST","path":"/v1/conversations/[^"]*/messages"' /tmp/api.log; then
  echo "FAIL: no message send reached the API"
  grep -oE '"method":"[A-Z]+","path":"/v1/conversations[^"]*"' /tmp/api.log | sort | uniq -c || true
  exit 1
fi
if ! grep -qE '"method":"POST","path":"/v1/conversations/[^"]*/accept"' /tmp/api.log; then
  echo "FAIL: accepting a request did not reach the API"
  exit 1
fi
# The long poll is the delivery mechanism; if the app never issued one, messages
# arrive only when the screen is reopened and FR-011 is not met on the device.
if ! grep -qE '"path":"/v1/conversations/[^"]*/messages\?[^"]*wait=' /tmp/api.log; then
  echo "WARNING: the app never issued a long-poll read. Delivery on device is"
  echo "not continuous, whatever the journeys showed."
fi
echo "conversations API served:"
grep -oE '"method":"[A-Z]+","path":"/v1/conversations[^"?]*"' /tmp/api.log | sort | uniq -c

echo "== 004/US5: did the save reach the server? =="
# A star that flips locally satisfies every view assertion and is exactly the
# defect the react control shipped with.
if ! grep -qE '"method":"PUT","path":"/v1/posts/[^"]*/save"' /tmp/api.log; then
  echo "FAIL: saving a post did not reach the API"
  grep -oE '"method":"[A-Z]+","path":"/v1/(posts/[^"]*/save|me/saved)"' /tmp/api.log | sort | uniq -c || true
  exit 1
fi
if ! grep -qE '"path":"/v1/me/saved' /tmp/api.log; then
  echo "FAIL: the saved list was never fetched"
  exit 1
fi

echo "== 004/US2: did the post actually land AT the place? =="
# A chip rendered from local state satisfies any view assertion. The place page
# is a SERVER query, so asking it is the only claim worth making.
PLACE_POSTS="$(curl -s "http://127.0.0.1:3000/v1/places/$PLACE_ID/posts?limit=20")"
if ! echo "$PLACE_POSTS" | grep -q "published from a real device, at a place"; then
  echo "FAIL: the published post is not on its place page"
  echo "$PLACE_POSTS" | head -c 2000
  exit 1
fi
if ! grep -qE '"method":"PUT","path":"/v1/places/[^"]*/follow"' /tmp/api.log; then
  echo "FAIL: following a place did not reach the API"
  exit 1
fi
echo "places API served:"
grep -oE '"method":"[A-Z]+","path":"/v1/places[^"?]*"' /tmp/api.log | sort | uniq -c

echo "PASS: the real APK ran on Android, exercised the real API, and completed the journeys."
