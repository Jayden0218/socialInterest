#!/usr/bin/env bash
#
# Runs on the host, against an emulator that is already booted, and drives the
# real APK against the real API. Called by the emulator runner's `script:`.
#
# The point of this file is that it fails loudly. A device pass that installs an
# app, sees nothing, and exits 0 is the exact shape of test that let five defects
# through in feature 001 - so every check below asserts on content, not shape.
set -euo pipefail

PKG=app.socialinterest
APK=apps/mobile/android/app/build/outputs/apk/release/app-release.apk
OUT=artifacts/android-device-pass
mkdir -p "$OUT"

echo "== the emulator must be able to reach the API on the host =="
# 10.0.2.2 is the emulator's alias for the host loopback. If this fails the app
# cannot possibly work, and we want to know that before blaming the app.
adb shell 'ping -c 1 -W 5 10.0.2.2' > "$OUT/ping.txt" 2>&1 || true
cat "$OUT/ping.txt"

echo "== install =="
adb install -r -g "$APK"
adb shell pm list packages | grep -q "$PKG"

echo "== launch =="
adb logcat -c
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1
sleep 25

echo "== the process must still be alive: a crash on launch exits here =="
pid=$(adb shell pidof "$PKG" | tr -d '\r')
if [ -z "$pid" ]; then
  echo "FAIL: $PKG is not running after launch"
  adb logcat -d | grep -iE "AndroidRuntime|FATAL" | tail -40 | tee "$OUT/crash.txt"
  exit 1
fi
echo "running as pid $pid"

echo "== capture what is actually on screen =="
adb exec-out screencap -p > "$OUT/home.png"
adb shell uiautomator dump /sdcard/ui.xml >/dev/null
adb pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null
adb logcat -d > "$OUT/logcat.txt"

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

echo "PASS: the real APK ran on Android and exercised the real API."
