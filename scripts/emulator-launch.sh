#!/usr/bin/env bash
#
# Starts an Android emulator and ALWAYS captures its own output.
#
# This exists because six attempts in feature 002 produced six hypotheses and no
# evidence. `reactivecircus/android-emulator-runner` runs the emulator as a child
# process and surfaces only its own poll loop, so every failure looked identical:
# `adb: device 'emulator-5554' not found` repeated until a timeout, then
# `Connection refused`. The one artefact that would distinguish "the AVD was not
# found" from "the GPU backend failed" from "the kernel refused to start" was
# never read, and one guess at it was asserted in project documentation and later
# had to be retracted.
#
# So the contract of this script is not "boot an emulator". It is:
#
#   $OUT/runtime-output.log EXISTS AND IS NON-EMPTY ON EVERY PATH, INCLUDING SUCCESS.
#
# A failure with that file is a useful result. A failure without it is the bug
# this script was written to remove.
set -uo pipefail

OUT="${OUT:-artifacts/android-device-pass}"
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/usr/local/lib/android/sdk}}"
API="${EMULATOR_API:-30}"
TARGET="${EMULATOR_TARGET:-default}"
ABI="${EMULATOR_ABI:-x86_64}"
AVD="${EMULATOR_AVD:-sih}"
BOOT_TIMEOUT="${EMULATOR_BOOT_TIMEOUT:-900}"
LOG="$OUT/runtime-output.log"

mkdir -p "$OUT"
# Create the log immediately. If this script dies at any later point - including
# being killed - the file exists and says how far it got.
: > "$LOG"
say() { echo "[emulator-launch] $*" | tee -a "$LOG"; }

say "started $(date -u +%FT%TZ)"
say "sdk=$SDK api=$API target=$TARGET abi=$ABI avd=$AVD boot_timeout=${BOOT_TIMEOUT}s"

# Anything that leaves this script MUST leave the log behind and point at it.
finish() {
  local code=$1 reason=$2
  say "outcome=$reason exit=$code"
  say "finished $(date -u +%FT%TZ)"
  if [ "$code" -ne 0 ]; then
    echo "=================== emulator output ==================="
    cat "$LOG"
    echo "======================================================="
    echo "The above IS the evidence. Record it in a Runtime Attempt"
    echo "(docs/verification/runs/TEMPLATE-runtime-attempt.md) and draw only the"
    echo "conclusion it supports."
  fi
  exit "$code"
}
trap 'finish 1 killed' INT TERM

IMAGE="system-images;android-${API};${TARGET};${ABI}"

say "installing sdk packages"
# NOT `yes | sdkmanager` under `set -o pipefail`: when sdkmanager exits, `yes`
# dies of SIGPIPE and the pipeline reports 141, so a successful install looks
# like a failure. Found by running this locally before spending a CI run.
install_pkgs() {
  set +o pipefail
  yes 2>/dev/null | "$SDK/cmdline-tools/latest/bin/sdkmanager" --install \
    "platform-tools" "emulator" "$IMAGE" >>"$LOG" 2>&1
  local rc=$?
  set -o pipefail
  return $rc
}
install_pkgs || finish 1 sdkmanager_failed
# Trust the artefact, not only the exit code.
[ -x "$SDK/emulator/emulator" ] || finish 1 emulator_binary_missing

say "creating avd"
# --force replaces config.ini but leaves the .avd directory's contents, and a
# stale userdata.img keeps its original size regardless of what config says.
rm -rf "${ANDROID_AVD_HOME:-$HOME/.android/avd}/${AVD}.avd" \
       "${ANDROID_AVD_HOME:-$HOME/.android/avd}/${AVD}.ini"
echo no | "$SDK/cmdline-tools/latest/bin/avdmanager" create avd \
  -n "$AVD" -k "$IMAGE" --force >>"$LOG" 2>&1 \
  || finish 1 avd_create_failed

# The default userdata partition is 7.4 GB. That is more free space than a CI
# runner has after an SDK install, a Gradle build and a set of Docker images,
# and the emulator's response is to die FATALLY at startup:
#
#   FATAL | Not enough space to create userdata partition.
#           Available: 6278.66 MB, need 7372.80 MB.
#
# It is not launched in the foreground, so that fatal error surfaces only as a
# boot timeout with no device - which is precisely what all six attempts in
# feature 002 looked like. This app needs a fraction of it.
# The emulator requires roughly 1.2x this value in free disk before it will
# start, so 2048M asks for ~2.5 GB rather than the default's ~7.4 GB.
DATA_PARTITION_MB="${EMULATOR_DATA_PARTITION_MB:-2048}"
AVD_CONFIG="${ANDROID_AVD_HOME:-$HOME/.android/avd}/${AVD}.avd/config.ini"
if [ -f "$AVD_CONFIG" ]; then
  # The key is written `disk.dataPartition.size = 6442450944` - with spaces, and
  # in bytes. A pattern without them silently matches nothing and the default
  # stands, which is how this looked fixed while still failing.
  sed -i -E "/^[[:space:]]*disk\.dataPartition\.size[[:space:]]*=/d" "$AVD_CONFIG"
  echo "disk.dataPartition.size = ${DATA_PARTITION_MB}M" >> "$AVD_CONFIG"
  say "userdata partition set to ${DATA_PARTITION_MB}M"
  # Assert it, rather than assume the edit landed.
  grep -E "^[[:space:]]*disk\.dataPartition\.size" "$AVD_CONFIG" >>"$LOG" 2>&1 || true
  grep -qE "^[[:space:]]*disk\.dataPartition\.size[[:space:]]*=[[:space:]]*${DATA_PARTITION_MB}M" "$AVD_CONFIG" \
    || finish 1 partition_size_not_applied
else
  say "WARNING: no AVD config at $AVD_CONFIG; userdata partition left at its default"
fi
say "disk free: $(df -Pm . | awk 'NR==2{print $4" MB"}')"

# Reported, never gated: the emulator may still start without acceleration, and
# whether it did is exactly what a failed attempt needs to say.
say "acceleration check"
"$SDK/emulator/emulator" -accel-check >>"$LOG" 2>&1 || true
ls -l /dev/kvm >>"$LOG" 2>&1 || say "no /dev/kvm"

# The options the action defaults to, and which it is tested against. Overriding
# these is how run 4 was lost: -no-snapshot became -no-snapshot-save, which is a
# different flag - it still tries to LOAD a snapshot.
# -partition-size is passed as well as the config.ini edit: the config value
# alone was applied and IGNORED - the emulator still demanded 1.2x the 6 GB
# default. Belt and braces, because the failure mode is a fatal exit that looks
# like a timeout.
OPTS=(-no-window -gpu swiftshader_indirect -no-snapshot -noaudio -no-boot-anim
      -partition-size "$DATA_PARTITION_MB" -verbose)
say "launching: emulator -avd $AVD ${OPTS[*]}"

# The redirection is the entire point of this script.
"$SDK/emulator/emulator" -avd "$AVD" "${OPTS[@]}" >>"$LOG" 2>&1 &
EMU_PID=$!
say "emulator pid=$EMU_PID"

ADB="$SDK/platform-tools/adb"
"$ADB" start-server >>"$LOG" 2>&1 || true

deadline=$((SECONDS + BOOT_TIMEOUT))
booted=""
while [ $SECONDS -lt $deadline ]; do
  # A dead emulator is reported as dead, not waited out for the full budget.
  if ! kill -0 "$EMU_PID" 2>/dev/null; then
    say "emulator process exited after ${SECONDS}s without booting"
    finish 1 emulator_exited
  fi
  state=$("$ADB" -s emulator-5554 get-state 2>/dev/null || true)
  if [ "$state" = "device" ]; then
    if [ "$("$ADB" -s emulator-5554 shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then
      booted=1
      break
    fi
  fi
  sleep 10
done

if [ -z "$booted" ]; then
  say "no boot within ${BOOT_TIMEOUT}s; adb state='${state:-none}'"
  "$ADB" devices >>"$LOG" 2>&1 || true
  finish 1 boot_timeout
fi

say "booted after ${SECONDS}s"
"$ADB" -s emulator-5554 shell getprop ro.build.version.sdk >>"$LOG" 2>&1 || true
finish 0 booted
