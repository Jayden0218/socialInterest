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

# ASSERTED ON testIDs, NOT ON LABELS, and run 38 is why.
#
# This checked for the literal text `Discover`. 007 renamed that tab's LABEL to
# `Explore` - the artboards' word, and the better one - and the tab key,
# `tab-discover`, did not change, because it is in the testID snapshot and in
# the Maestro flows. So the app rendered perfectly and the runner failed it,
# 29 seconds in, before a single journey ran.
#
# A label is COPY. It will be reworded again, by somebody who has no reason to
# think a shell script depends on it, and `verify-maestro-ids.mjs` cannot see
# this file's assertions. A testID is an interface with a contract behind it
# (006/FR-027, contracts/testid-preservation.md), which is exactly what a
# smoke check should hold to.
#
# react-native maps testID to Android's resource-id, so the dump carries them.
for id in tab-feed tab-discover tab-profile; do
  grep -q "$id" "$OUT/ui.xml" || { echo "FAIL: '$id' is not on screen"; exit 1; }
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

# 007. Two people cannot be driven through one device's UI, so the other author
# is seeded server-side and the ASSERTIONS happen in the app.
#
# This replaced the FR-033 fixture, which produced a followed person's post in
# an UNfollowed interest for a requirement 007 withdrew. Note what happened
# here: the fixture file was deleted with the requirement and THIS SCRIPT WENT
# ON CALLING IT — a break that costs a whole emulator run to discover, and that
# `verify-maestro-ids.mjs` cannot see because the variables were still passed.
echo "== seed the feed fixture =="
FIXTURE="$(cd apps/e2e && E2E_BASE_URL=http://127.0.0.1:3000 npx tsx scripts/seed-feed-fixture.ts "$TOKEN")"
echo "$FIXTURE"
PRESENT="$(echo "$FIXTURE" | sed -n 's/^PRESENT=//p')"
AUTHOR="$(echo "$FIXTURE" | sed -n 's/^AUTHOR=//p')"
INTEREST="$(echo "$FIXTURE" | sed -n 's/^INTEREST=//p')"
COLD_TOKEN="$(echo "$FIXTURE" | sed -n 's/^COLD_TOKEN=//p')"
[ -n "$PRESENT" ] && [ -n "$AUTHOR" ] && [ -n "$INTEREST" ] && [ -n "$COLD_TOKEN" ] \
  || { echo "FAIL: the feed fixture did not print what the flows need"; exit 1; }

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
FRIEND_NAME="$(echo "$CHAT" | sed -n 's/^FRIEND_NAME=//p')"
# 008/US9. The prefix `31-mention.yaml` types to exercise the autocomplete; the
# fixture asserts it actually finds the friend before printing it.
FRIEND_PREFIX="$(echo "$CHAT" | sed -n 's/^FRIEND_PREFIX=//p')"
REQUEST_BODY="$(echo "$CHAT" | sed -n 's/^REQUEST_BODY=//p')"
FRIEND_BODY="$(echo "$CHAT" | sed -n 's/^FRIEND_BODY=//p')"
[ -n "$REQUESTER" ] && [ -n "$FRIEND" ] && [ -n "$FRIEND_NAME" ] && [ -n "$FRIEND_PREFIX" ] \
  && [ -n "$REQUEST_BODY" ] && [ -n "$FRIEND_BODY" ] \
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

# 005/US3. Three other people, because a group needs more than the device can
# drive. They FOLLOW the device person: FR-022 keys the invitation state on the
# INVITEE's follow, so without this every invitation would be a request and the
# flow would exercise a different path while still passing.
echo "== seed the group fixture (005/US3) =="
GROUP="$(cd apps/e2e && E2E_BASE_URL=http://127.0.0.1:3000 npx tsx scripts/seed-group-fixture.ts "$TOKEN")"
echo "$GROUP"
GROUP_SEARCH="$(echo "$GROUP" | sed -n 's/^GROUP_SEARCH=//p')"
GROUP_MEMBER_A="$(echo "$GROUP" | sed -n 's/^GROUP_MEMBER_A=//p')"
GROUP_MEMBER_B="$(echo "$GROUP" | sed -n 's/^GROUP_MEMBER_B=//p')"
GROUP_MEMBER_C="$(echo "$GROUP" | sed -n 's/^GROUP_MEMBER_C=//p')"
[ -n "$GROUP_SEARCH" ] && [ -n "$GROUP_MEMBER_A" ] && [ -n "$GROUP_MEMBER_B" ] && [ -n "$GROUP_MEMBER_C" ] \
  || { echo "FAIL: the group fixture did not print what the flows need"; exit 1; }

# 008/US13. A follow request waiting on the device person, which needs a second
# person AND the account to have been private at the moment they asked. The
# fixture sets that up and returns the account to open, so the flow can turn
# privacy on itself - a toggle is not idempotent (005, run 32).
echo "== seed the follow-request fixture (008/US13) =="
FOLLOWREQ="$(cd apps/e2e && E2E_BASE_URL=http://127.0.0.1:3000 npx tsx scripts/seed-follow-request-fixture.ts "$TOKEN")"
echo "$FOLLOWREQ"
FOLLOW_REQUESTER="$(echo "$FOLLOWREQ" | sed -n 's/^FOLLOW_REQUESTER=//p')"
[ -n "$FOLLOW_REQUESTER" ] \
  || { echo "FAIL: the follow-request fixture did not print what the flow needs"; exit 1; }

# 008/US14. A moderation notice addressed to the device person, which takes a
# post, a reporter AND a moderator - the device drives one ordinary person, so
# the whole round trip happens server-side and the app is left the two things
# only it can show: being told what and why, and being able to disagree.
echo "== seed the moderation-notice fixture (008/US14) =="
MODNOTICE="$(cd apps/e2e && E2E_BASE_URL=http://127.0.0.1:3000 npx tsx scripts/seed-moderation-notice-fixture.ts "$TOKEN")"
echo "$MODNOTICE"
REMOVED_ACTION_ID="$(echo "$MODNOTICE" | sed -n 's/^REMOVED_ACTION_ID=//p')"
[ -n "$REMOVED_ACTION_ID" ] \
  || { echo "FAIL: the moderation-notice fixture did not print what the flow needs"; exit 1; }

# ---------------------------------------------------------------------------
# A SAMPLER, because run 26 died in a way nothing here could see.
#
# Eleven of seventeen flows passed and then the device went `offline` mid
# `inputText`, ten and a half minutes in. Every later flow failed in under 40ms
# with "Launch app with clear state FAILED" - collateral, not findings. The
# evidence dump could not say why, for two reasons worth naming:
#
#   1. logcat.txt is captured BEFORE the journeys and never refreshed, so the
#      "logcat (tail)" printed on failure was eleven minutes stale. It described
#      the app starting, not the device dying.
#   2. disk-free.txt is written into the ARTIFACT, and artifacts are served from
#      a host this environment's egress denies. Evidence nobody can fetch is not
#      evidence.
#
# qemu was still alive at job cleanup, so the emulator process did not crash -
# adb lost the device while it ran. Host memory and disk are the obvious
# suspects and BOTH ARE STILL GUESSES; this samples them every 15 seconds so the
# next failure is read off a timeline instead of reasoned about. This project
# has spent six runs on an invisible failure once already.
SAMPLES="$OUT/resource-samples.txt"
sample_resources() {
  printf 'ts\tdisk_avail_mb\tmem_avail_mb\tswap_used_mb\tqemu_rss_mb\tadb_state\n' > "$SAMPLES"
  while :; do
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' \
      "$(date -u +%H:%M:%S)" \
      "$(df -Pm / | awk 'NR==2{print $4}')" \
      "$(free -m | awk '/^Mem:/{print $7}')" \
      "$(free -m | awk '/^Swap:/{print $3}')" \
      "$(pgrep -f 'qemu-system-x86_6[4]' 2>/dev/null | xargs -r ps -o rss= -p 2>/dev/null | awk '{s+=$1} END{print int(s/1024)}')" \
      "$(adb get-state 2>&1 | tr -d '\r' | head -1)" \
      >> "$SAMPLES"
    sleep 15
  done
}
sample_resources & SAMPLER_PID=$!
# Killed however this script leaves, or it outlives the job as an orphan.
trap 'kill "$SAMPLER_PID" 2>/dev/null || true' EXIT

# FR-031's before-value, read now because the flows are about to change it.
# `|| true` is load-bearing, and the reason is NOT the one I first wrote here.
#
# The mechanism is real and I proved it: under `set -euo pipefail`, a command
# substitution whose pipeline ends in a grep that matches nothing makes the
# ASSIGNMENT fail, and the script dies at this line before a single journey runs.
#
# But I justified it by claiming an absent `message` key is the expected initial
# state. It is not. `mint-device-token.ts` writes all four preferences as `true`,
# and run 31 read back `before: "message":true`. So this would NOT have aborted
# every pass, as I said it would - it guards a state that does not arise on this
# path today, and would arise the moment a person is created any other way.
# Correct to keep, wrong to have argued from a default I never checked.
PREFS_BEFORE="$(curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3000/v1/me \
  | grep -oE '"message"[[:space:]]*:[[:space:]]*(true|false)' | head -1 || true)"

echo "== journeys =="

# ONE FLOW PER INVOCATION, not `maestro test .maestro/`.
#
# Runs 26 and 27 both lost the device at the twelfth flow, ~10.5 minutes into a
# single Maestro session, mid-`inputText`:
#
#   DeviceServerDiedException: Device server died during 'inputText'
#   ... Caused by: java.io.IOException: ... device offline
#
# The sampler added after run 26 ruled out every guess anyone had: disk was flat
# at ~99.8 GB free, available memory flat at ~11.5 GB of 16, swap zero, qemu RSS
# flat at 2.7 GB, and `adb get-state` read `device` in the sample immediately
# before. qemu was still running at the failure, and logcat read fine seconds
# later, showing the guest's adbd re-handshaking a fresh host connection:
#
#   I adbd: host-13: read thread spawning
#   I adbd: host-13: already offline
#
# So the device drops off adb TRANSIENTLY and comes back within seconds. Nothing
# is exhausted and nothing crashes.
#
# WHY adbd drops is still not established, and this does not pretend to fix it.
# What it fixes is the COST: one directory-wide invocation holds a single
# connection for the whole suite, so a momentary drop at flow 12 took out flow 12
# and every flow after it - five failures in 10-40ms each, all collateral, in
# both runs. Per-flow invocations give each flow its own connection, so a drop
# costs one flow and the next one reconnects.
#
# The retry below fires ONLY on a device-transport error, never on an assertion.
# That distinction is the whole point: retrying an assertion failure would hide
# exactly the product defects this pass exists to find, and this project has
# already shipped seven defects that a green suite could not see.
MAESTRO_ENV=(
  -e TOKEN="$TOKEN" -e PRESENT="$PRESENT" -e INTEREST="$INTEREST"
  -e AUTHOR="$AUTHOR" -e COLD_TOKEN="$COLD_TOKEN"
  -e REQUESTER="$REQUESTER" -e FRIEND="$FRIEND" -e FRIEND_NAME="$FRIEND_NAME"
  -e FRIEND_PREFIX="$FRIEND_PREFIX"
  -e REQUEST_BODY="$REQUEST_BODY" -e FRIEND_BODY="$FRIEND_BODY"
  -e PLACE_NAME="$PLACE_NAME" -e PLACE_LOCALITY="$PLACE_LOCALITY"
  -e GROUP_MEMBER_A="$GROUP_MEMBER_A" -e GROUP_MEMBER_B="$GROUP_MEMBER_B"
  -e GROUP_MEMBER_C="$GROUP_MEMBER_C" -e GROUP_SEARCH="$GROUP_SEARCH"
  -e FOLLOW_REQUESTER="$FOLLOW_REQUESTER"
  -e REMOVED_ACTION_ID="$REMOVED_ACTION_ID"
)

# Sorted, so the order is the same on every run and a failure is comparable
# across runs. Safe to reorder: 09-report-and-block asserts the block affordance
# but never blocks, so no flow hides content from a later one.
mapfile -t FLOWS < <(find .maestro -maxdepth 1 -name '*.yaml' | sort)
echo "[journeys] ${#FLOWS[@]} flows, one Maestro session each"

FAILED=()
RETRIED=()
for flow in "${FLOWS[@]}"; do
  name="$(basename "$flow" .yaml)"
  attempt=1
  while :; do
    flog="$OUT/flow-$name-attempt$attempt.log"
    if maestro test "$flow" "${MAESTRO_ENV[@]}" \
         --format junit --output "$OUT/junit-$name.xml" \
         --debug-output "$OUT/debug-$name" > "$flog" 2>&1; then
      echo "[journeys] PASS $name (attempt $attempt)"
      break
    fi

    # A transport error is not a failed assertion. Only the former is retried.
    if [ "$attempt" -eq 1 ] \
       && grep -qE 'DeviceServerDiedException|device offline|device .emulator-[0-9]+. not found' "$flog"; then
      echo "[journeys] $name LOST THE DEVICE - transport error, not an assertion. Reconnecting."
      grep -oE 'DeviceServerDiedException[^\\]{0,160}' "$flog" | head -2 || true
      # wait-for-device first: the evidence says adbd comes back on its own, so
      # restarting the host server is the heavier fallback rather than the
      # opening move.
      timeout 90 adb wait-for-device || {
        echo "[journeys] device did not return in 90s; restarting the adb server"
        adb kill-server >/dev/null 2>&1 || true
        adb start-server >/dev/null 2>&1 || true
        timeout 120 adb wait-for-device || true
      }
      timeout 120 adb shell 'while [ "$(getprop sys.boot_completed)" != 1 ]; do sleep 1; done' \
        >/dev/null 2>&1 || true
      echo "[journeys] device state now: $(adb get-state 2>&1 | tr -d '\r' | head -1)"
      RETRIED+=("$name")
      attempt=2
      continue
    fi

    echo "[journeys] FAIL $name"
    tail -30 "$flog" || true
    FAILED+=("$name")
    break
  done
done

echo "[journeys] passed $(( ${#FLOWS[@]} - ${#FAILED[@]} ))/${#FLOWS[@]}"
[ ${#RETRIED[@]} -eq 0 ] || echo "[journeys] retried after a device drop: ${RETRIED[*]}"

# Merged for the workflow's evidence step, which knows one path.
cat "$OUT"/junit-*.xml > "$OUT/maestro-junit.xml" 2>/dev/null || true

if [ ${#FAILED[@]} -ne 0 ]; then
  {
    echo "FAIL: a journey did not pass: ${FAILED[*]}"
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
    # Only the flows that actually failed: per-flow debug output means the
    # directory now holds seventeen of these, and sixteen passing ones is the
    # "quarter of a megabyte of INFO chatter" problem again.
    for name in "${FAILED[@]}"; do
      echo "-- $name --"
      find "$OUT/debug-$name" -name 'maestro.log' -exec \
        grep -hE 'FAILED|Assertion is false|Element not found|No visible element' {} \; 2>/dev/null \
        | head -20 || true

      # WHAT WAS ON SCREEN INSTEAD — and until run 55 this was never printed.
      #
      # The comment above has said since run 12 that the debug output "carries
      # the VIEW HIERARCHY at the point of failure, which is what actually
      # answers 'the assertion says this id was not visible; what was on screen
      # instead'". It was never printed: the grep just re-prints the same
      # one-line summary the flow results already carry, and the hierarchy went
      # only to the artifact — which is on a blob host this sandbox's egress
      # denies with a 403.
      #
      # So runs 53, 54 and 55 were spent DISPROVING theories about three flows
      # (a load race, a flow-ordering block, a mis-aimed tap) rather than
      # reading what happened. That is the six-emulator-run mistake in a fourth
      # place, and the fix is the same: make the failure visible before changing
      # anything.
      #
      # The file names are not assumed — they are listed first, so a run whose
      # layout differs still teaches us where to look next time.
      echo "  -- debug files --"
      find "$OUT/debug-$name" -type f 2>/dev/null | sed 's|^|     |' | head -25 || true
      echo "  -- testIDs present at failure --"
      # Every id the hierarchy carries, de-duplicated. An assertion that a
      # SPECIFIC id was missing is answered by the list of ids that were there:
      # a screen that never navigated shows the id set of the screen it stayed
      # on, which no amount of reasoning about timeouts can tell you.
      find "$OUT/debug-$name" -type f \( -name '*.json' -o -name '*.log' \) \
        -exec grep -ohE '"(resource-id|resourceId|accessibilityText|testID)"[[:space:]]*:[[:space:]]*"[^"]+"' {} \; 2>/dev/null \
        | sed -E 's/.*"([^"]+)"$/\1/' | sort -u | head -60 || true
    done
    # WAS THE DEVICE STILL THERE? Answered first, because if it was not then
    # every "assertion failed" above is collateral and reading them as findings
    # is how a run gets diagnosed backwards. Run 26 lost the device at flow 12
    # and reported six failures.
    echo "=============== device state at failure ==============="
    echo "adb get-state: $(adb get-state 2>&1 | tr -d '\r' | head -1)"
    adb devices -l 2>&1 | head -10 || true
    # -f, matching the full command line. `ps -C` and bare `pgrep` match `comm`,
    # which the kernel truncates to 15 characters, so `qemu-system-x86_64-headless`
    # never matches and the count silently reads 0 - a dead-emulator answer for a
    # live one, which is the worst kind of wrong here.
    echo "qemu processes: $(pgrep -cf 'qemu-system-x86_6[4]' 2>/dev/null | head -1)"
    echo "=============== host resources over the run ==============="
    # The whole timeline, not the last value: "it ran out at 01:49" is a cause,
    # "it is low now" is not.
    cat "$SAMPLES" 2>/dev/null || echo "(no samples)"
    echo "-- now --"; df -h / | tail -1; free -m | head -3
    echo "=============== logcat AFTER the journeys ==============="
    # Refreshed here on purpose. The copy taken before the run describes the app
    # starting and says nothing about a failure eleven minutes later; printing
    # it as "the tail" is worse than printing nothing, because it looks like
    # evidence. `|| true` throughout: a dead device cannot be read, and that
    # answer is itself informative.
    if adb logcat -b all -d > "$OUT/logcat-after.txt" 2>&1; then
      grep -iE "AndroidRuntime|FATAL EXCEPTION|beginning of crash|lowmemorykiller|Out of memory|am_kill" \
        "$OUT/logcat-after.txt" | tail -30 || echo "(no fatal entries)"
      echo "-- last 30 lines --"; tail -30 "$OUT/logcat-after.txt" || true
    else
      echo "(logcat could not be read - the device is gone, which is the finding)"
    fi
    echo "=============== emulator's own output (tail) ==============="
    tail -40 "$OUT/runtime-output.log" 2>/dev/null || echo "(no emulator log)"
    echo "=============== the screen when it stopped ==============="
    # The device's own view of the final state, which needs no artifact.
    adb shell uiautomator dump /sdcard/fail.xml >/dev/null 2>&1 || true
    adb shell cat /sdcard/fail.xml 2>/dev/null \
      | grep -oE 'resource-id="[^"]*"|text="[^"]{1,50}"' | grep -v '=""' | sort -u | head -40 || true
    echo "==================================================="
  }
  exit 1
fi

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

echo "== 004/US4, FR-031: was the message preference actually turned off? =="
# 18-notification-settings' own header says this is asserted service-side. It
# was not - the check did not exist, and the flow's evidence was a `PATCH /v1/me
# 200` in the request log. A 200 says a write happened, not that it wrote THIS
# field: a switch bound to the wrong key sends a valid patch and passes.
#
# Worth having beyond the pedantry, because run 28 found that this screen's
# switch for `message` did not exist at all while the requirement was recorded
# as met. Reading the value back is the difference between "the control is on
# screen" and "the preference is off".
#
# Asserted as a CHANGE, not against a hardcoded `false`. A new person's
# notificationPrefs start empty - the service reads `=== false`, so an absent key
# means enabled - and the switch therefore renders from `undefined`. Which
# direction the tap moves it is not knowable here, and writing `false` in would
# have failed the whole pass for my own reason rather than the product's.
PREFS_AFTER="$(curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3000/v1/me \
  | grep -oE '"message"[[:space:]]*:[[:space:]]*(true|false)' | head -1 || true)"
echo "message preference before: ${PREFS_BEFORE:-(absent)}  after: ${PREFS_AFTER:-(absent)}"
if [ -z "$PREFS_AFTER" ]; then
  echo "FAIL: the flow saved, but no 'message' key exists on the profile."
  echo "A switch bound to the wrong key sends a perfectly valid patch and a 200."
  exit 1
fi
if [ "$PREFS_AFTER" = "$PREFS_BEFORE" ]; then
  echo "FAIL: the message preference is unchanged after the flow toggled and saved it"
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

echo "== 005/US1: did the rating actually reach the server? =="
# A star filled in locally satisfies any view assertion, and `RatingControl`
# renders the summary from the reloaded place - so the flow's "4.0 - 1 rating"
# is already a server-shaped claim. This is the other half: the WRITE happened,
# with a 200, over HTTP, from the device.
if ! grep -qE '"method":"PUT","path":"/v1/places/[^"]*/rating"' /tmp/api.log; then
  echo "FAIL: rating a place did not reach the API"
  grep -oE '"method":"[A-Z]+","path":"/v1/places[^"]*"' /tmp/api.log | sort | uniq -c || true
  exit 1
fi
# And the review is READABLE on the place page, by asking the server rather than
# the screen. Six surfaces in this codebase shipped returning candidate rows
# because nothing asked for the response.
REVIEWS="$(curl -s "http://127.0.0.1:3000/v1/places/$PLACE_ID/reviews?limit=20")"
if ! echo "$REVIEWS" | grep -q "Rated from a real device."; then
  echo "FAIL: the review written on the device is not on the place page"
  echo "$REVIEWS" | head -c 2000
  exit 1
fi
# FR-010: hydrated, not a persistence row. A review whose author is a bare id is
# the defect this project has now shipped six times.
if ! echo "$REVIEWS" | grep -q '"author"'; then
  echo "FAIL: the review response carries no author"
  echo "$REVIEWS" | head -c 2000
  exit 1
fi

echo "== 005/US3: did the group actually exist on the server? =="
if ! grep -qE '"method":"POST","path":"/v1/conversations/groups"' /tmp/api.log; then
  echo "FAIL: creating a group did not reach the API"
  grep -oE '"method":"[A-Z]+","path":"/v1/conversations[^"?]*"' /tmp/api.log | sort | uniq -c || true
  exit 1
fi
if ! grep -qE '"method":"POST","path":"/v1/conversations/[^"]*/participants"' /tmp/api.log; then
  echo "FAIL: adding a participant did not reach the API"
  exit 1
fi
if ! grep -qE '"method":"POST","path":"/v1/conversations/[^"]*/leave"' /tmp/api.log; then
  echo "FAIL: leaving the group did not reach the API"
  exit 1
fi
# FR-021, asked of the SERVER. The flow saw the row disappear from a list it had
# just re-fetched, which is good evidence and not proof; this is the claim.
GROUPS_AFTER="$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://127.0.0.1:3000/v1/conversations?state=accepted&limit=50")"
if echo "$GROUPS_AFTER" | grep -q "Climbing Tuesday"; then
  echo "FAIL: the group is still in the inbox after leaving it"
  echo "$GROUPS_AFTER" | head -c 2000
  exit 1
fi

# ---------------------------------------------------------------------------
# THE APP, PHOTOGRAPHED ON A DEVICE.
#
# Every UI image this project has is react-native-web in a headless browser.
# Nobody - including whoever wrote the redesign - has ever looked at what it
# renders on Android, because the artifact these runs upload is served from a
# blob host the agent sandbox's egress denies with a 403. So the pictures went
# somewhere nobody could reach, which is the same shape as the evidence problem
# runs 1-6 and run 40 were spent on.
#
# These are committed back into the repository by the workflow instead.
#
# NON-FATAL BY DESIGN. The journeys above decide whether the product works; this
# only shows what it looks like. A capture that fails must not turn a 20/20 run
# into a red one - it is evidence, not a gate.
echo "== capturing the screens on the device =="
CAPTURE_DIR="$(cd "$OUT" && pwd)/screens"
mkdir -p "$CAPTURE_DIR"
# Absolute paths on both sides. `takeScreenshot` writes relative to the working
# directory, so the capture has to run FROM the output directory - which means
# the flow and the log cannot be named relatively from there.
CAPTURE_FLOW="$(pwd)/.maestro/capture/screens.yaml"
CAPTURE_LOG="$(cd "$OUT" && pwd)/capture.log"
# A marker to find the images by, because RUN 44 PROVED THE CWD ASSUMPTION
# WRONG. The flow ran - the API log shows the entire second walk through the app,
# sign-in through profile, and `seed-interests` and `/v1/notifications` each went
# from one request to two - but no PNG appeared in the directory Maestro was
# invoked from. `takeScreenshot` does not resolve against the working directory.
#
# So this stops guessing the convention and looks for them instead: anything
# matching the flow's own `NN-name.png` shape, anywhere in the workspace or
# Maestro's home, newer than the moment the capture started.
CAPTURE_MARKER="$(mktemp)"
if (cd "$CAPTURE_DIR" && maestro test "$CAPTURE_FLOW" \
      "${MAESTRO_ENV[@]}" > "$CAPTURE_LOG" 2>&1); then
  echo "[screens] the capture flow completed"
else
  echo "[screens] the capture flow did NOT complete. The journeys already"
  echo "[screens] passed, so this is recorded and not fatal. Tail:"
  tail -20 "$CAPTURE_LOG" 2>/dev/null || true
fi

# THE SWEEP RUNS EITHER WAY, and run 45 is why.
#
# It was inside the success branch. The flow reached screenshot 10 of 13 and
# then failed navigating back to the profile tab - so TEN IMAGES EXISTED ON DISK
# and the run collected none of them, because a partial capture took the else
# branch. A capture is evidence, not an assertion: every screen it did reach is
# worth having, and the one it did not is a line in the log.
found=0
while IFS= read -r img; do
  [ -e "$img" ] || continue
  # -n: never overwrite one already collected, so the first match wins and a
  # duplicate elsewhere cannot quietly replace it.
  mv -n "$img" "$CAPTURE_DIR/" 2>/dev/null && found=$((found + 1))
done < <(find "$PWD" "${HOME}/.maestro" -type f -name '[0-9][0-9]-*.png' \
           -newer "$CAPTURE_MARKER" -not -path "$CAPTURE_DIR/*" 2>/dev/null)
echo "[screens] swept $found image(s) into $CAPTURE_DIR"
if [ "$found" -eq 0 ]; then
    # MAKE THE FAILURE VISIBLE RATHER THAN GUESSING AGAIN. Run 44 spent a whole
    # run establishing only that the images were not where I assumed. If the
    # sweep also misses, this says what WAS written and where, so the next
    # attempt is a reading rather than a third guess.
    echo "[screens] no images matched. Every file written during the capture:"
    find "$PWD" "${HOME}/.maestro" -type f -newer "$CAPTURE_MARKER" 2>/dev/null \
      | grep -vE '/(node_modules|\.git)/' | head -40 || true
    echo "[screens] tail of the capture log:"
    tail -30 "$CAPTURE_LOG" 2>/dev/null || true
  fi
echo "[screens] captured: $(ls "$CAPTURE_DIR"/*.png 2>/dev/null | wc -l) image(s)"
rm -f "$CAPTURE_MARKER"
# Blank images are worse than none: this project once filed an all-black capture
# as evidence. Anything that fails the check is deleted rather than committed.
for img in "$CAPTURE_DIR"/*.png; do
  [ -e "$img" ] || continue
  if ! node scripts/assert-screen-not-blank.mjs "$img" >/dev/null 2>&1; then
    echo "[screens] $(basename "$img") is blank - deleting rather than filing it"
    rm -f "$img"
  fi
done
echo "[screens] kept: $(ls "$CAPTURE_DIR"/*.png 2>/dev/null | wc -l) image(s)"

echo "PASS: the real APK ran on Android, exercised the real API, and completed the journeys."
