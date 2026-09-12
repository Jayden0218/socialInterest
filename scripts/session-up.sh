#!/usr/bin/env bash
#
# 009/US2. Bring up a disposable session and emit its descriptor.
#
# Implements specs/009-session-server/contracts/session-descriptor.md.
#
# THIS IS A SCRIPT AND NOT INLINE WORKFLOW YAML, for the reason
# scripts/emulator-launch.sh exists: a script can be run and watched locally for
# nothing, and a workflow step can only be run by spending a dispatch. Six
# emulator runs were once spent iterating on a failure nobody could observe, and
# the fix arrived in the same execution as the first observation. Prefer the free
# observation to the expensive guess.
#
# Usage:  scripts/session-up.sh [lifetime-minutes]
#
set -Eeuo pipefail

LIFETIME_MINUTES="${1:-120}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${RUNNER_TEMP:-/tmp}/sih-session"
mkdir -p "$RUN_DIR"

# Pinned, per research R2. Quick tunnels are a temporary-use facility and recent
# releases have broken older configurations; a floating version puts the ability
# to start a session outside this repository's control, which is the same
# argument docker-compose.yml already makes for pinning the MinIO image.
CLOUDFLARED_VERSION="2025.8.1"

SUMMARY="${GITHUB_STEP_SUMMARY:-$RUN_DIR/summary.md}"

say() { printf '%s\n' "$*" >&2; }

# ---------------------------------------------------------------------------
# FR-021: a failure names the step that failed, AT THE MOMENT IT FAILS.
#
# Not at the end of the job. Run 56's per-flow evidence lived after the loop it
# described; Maestro wedged, the step was killed 47 minutes later, and the block
# printed nothing at all - for the first failure it existed for. Anything written
# only on the happy path is written nowhere.
# ---------------------------------------------------------------------------
STEP="starting"
fail() {
  local message="$1"
  {
    printf '\n## Session failed\n\n'
    printf '**Step:** %s\n\n' "$STEP"
    printf '**Reason:** %s\n\n' "$message"
    printf 'The steps are numbered in `contracts/session-descriptor.md` §1.\n'
  } >> "$SUMMARY"
  say "FAILED at step: $STEP"
  say "reason: $message"
  exit 1
}
trap 'fail "command failed: ${BASH_COMMAND}"' ERR

# ---------------------------------------------------------------------------
# Step 1 — backing services, proven ready
# ---------------------------------------------------------------------------
STEP="1. backing services up and ready"
say "==> $STEP"
cd "$REPO_ROOT"
docker compose up -d
for _ in $(seq 1 60); do
  # No -f on the DynamoDB probe: it answers a bare GET / with 400, and -f would
  # turn that documented answer into a failure. That mistake cost a real run.
  if curl -sf -o /dev/null http://127.0.0.1:9000/minio/health/live \
     && curl -so /dev/null http://127.0.0.1:8000; then
    ready=yes; break
  fi
  sleep 2
done
[ "${ready:-}" = yes ] || { docker compose logs >&2 || true; fail "backing services never became ready"; }

# ---------------------------------------------------------------------------
# Step 2 — table, bucket, catalogue. BEFORE the application starts.
#
# The catalogue is loaded into an in-memory cache by onModuleInit, so an
# application started against an empty table holds an empty catalogue and
# nothing can be posted to. android-emulator.yml has always seeded first.
# ---------------------------------------------------------------------------
STEP="2. create the table and bucket, seed the catalogue"
say "==> $STEP"
pnpm --filter @sih/infra db:create-local
pnpm --filter @sih/infra s3:create-local
pnpm --filter @sih/infra seed:catalogue

# ---------------------------------------------------------------------------
# Tunnel helper. Used for both addresses.
# ---------------------------------------------------------------------------
install_cloudflared() {
  [ -x "$RUN_DIR/cloudflared" ] && return 0
  curl -fsSL -o "$RUN_DIR/cloudflared" \
    "https://github.com/cloudflare/cloudflared/releases/download/${CLOUDFLARED_VERSION}/cloudflared-linux-amd64"
  chmod +x "$RUN_DIR/cloudflared"
}

# Opens a tunnel to a local port and echoes its public address on stdout.
#
# THE PRINTED ADDRESS IS NOT A WORKING TUNNEL, and this function exists in this
# shape because of a free observation rather than a theory.
#
# Run locally 2026-09-12, cloudflared prints:
#
#   14:29:40 INF Requesting new quick Tunnel on trycloudflare.com...
#   14:29:43 INF |  https://issue-fort-browsers-hope.trycloudflare.com  |
#   14:29:59 ERR Unable to establish connection with Cloudflare edge
#                error="DialContext error: dial tcp 198.41.192.227:7844: i/o timeout"
#
# The address is issued in THREE SECONDS and the edge connection fails SIXTEEN
# SECONDS LATER, then retries forever. A version of this function that returned
# as soon as it saw a URL - which is what it originally did - would have emitted
# a descriptor naming an address that never becomes reachable, and the person
# holding it would be debugging their phone.
#
# So it waits for a registered connection AND then proves the address end to end
# by fetching something real through it. An address nobody has reached is not an
# address.
open_tunnel() {
  local port="$1" name="$2" probe_path="$3" log="$RUN_DIR/tunnel-$2.log"
  : > "$log"
  # --protocol http2 so the edge connection goes over TCP/443 rather than QUIC.
  # It does NOT help where the edge dial itself is blocked - that is raw TCP to
  # port 7844 either way, which is what the trace above shows.
  "$RUN_DIR/cloudflared" tunnel --no-autoupdate --protocol http2 \
    --url "http://127.0.0.1:${port}" > "$log" 2>&1 &
  echo $! > "$RUN_DIR/tunnel-$name.pid"

  local address=""
  for _ in $(seq 1 45); do
    address="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$log" | head -1 || true)"
    [ -n "$address" ] && break
    sleep 2
  done
  [ -n "$address" ] || { say "no address was ever issued for $name"; tail -30 "$log" >&2; return 1; }

  # FR-011, contract §2. Asserted rather than assumed: the provider gives TLS
  # for free, which is exactly why a swap could drop it silently. Research R2
  # names three fallbacks and a self-hosted tunnel serves plaintext happily.
  case "$address" in
    https://*) : ;;
    *) say "address is not encrypted: $address"; return 1 ;;
  esac

  # The edge connection, which is the part that fails.
  local registered=no
  for _ in $(seq 1 45); do
    if grep -q 'Registered tunnel connection' "$log"; then registered=yes; break; fi
    sleep 2
  done
  if [ "$registered" != yes ]; then
    say "$name: an address was issued but no edge connection was ever registered"
    say "this is the failure shape research R2 records for a restricted network:"
    grep -m3 'Unable to establish connection' "$log" >&2 || tail -20 "$log" >&2
    return 1
  fi

  # And prove it end to end. Registration is necessary, not sufficient.
  local reached=no
  for _ in $(seq 1 30); do
    if curl -sf -o /dev/null --max-time 10 "${address}${probe_path}"; then reached=yes; break; fi
    sleep 2
  done
  [ "$reached" = yes ] || { say "$name: $address never served ${probe_path}"; return 1; }

  printf '%s' "$address"
}

install_cloudflared

# ---------------------------------------------------------------------------
# Step 3 — the MEDIA address, BEFORE the application starts
#
# THE CLAUSE THIS WHOLE SCRIPT IS ORDERED AROUND. The application signs every
# media URL against the address a client will use, and a presigned signature
# covers the host - so a URL signed against the wrong address cannot be repaired
# afterwards by rewriting it. Run 13 created three upload targets and published
# nothing because the bytes never landed.
# ---------------------------------------------------------------------------
STEP="3. open the media tunnel and capture its address"
say "==> $STEP"
MEDIA_ADDRESS="$(open_tunnel 9000 media /minio/health/live)" || fail "the media tunnel never became reachable"
say "media address: $MEDIA_ADDRESS"

# ---------------------------------------------------------------------------
# Step 4 — the application, pointed at the media address
# ---------------------------------------------------------------------------
STEP="4. start the application with S3_PUBLIC_ENDPOINT set to the media address"
say "==> $STEP"

# FR-015. Its own secret, every session. configuration.ts refuses the published
# development value, and that refusal must stay reachable.
export LOCAL_JWT_SECRET="${LOCAL_JWT_SECRET:-$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')}"

(
  cd "$REPO_ROOT/apps/api"
  RUNTIME_PROFILE=local API_PORT=3000 \
  S3_PUBLIC_ENDPOINT="$MEDIA_ADDRESS" \
    npx tsx src/main.ts > "$RUN_DIR/api.log" 2>&1 &
  echo $! > "$RUN_DIR/api.pid"
)
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null "http://127.0.0.1:3000/v1/health"; then api=yes; break; fi
  sleep 2
done
[ "${api:-}" = yes ] || { cat "$RUN_DIR/api.log" >&2; fail "the application never became ready"; }

# ---------------------------------------------------------------------------
# Step 5 — the BACKEND address, the one a person types into the app
# ---------------------------------------------------------------------------
STEP="5. open the application tunnel and capture its address"
say "==> $STEP"
BACKEND_ADDRESS="$(open_tunnel 3000 backend /v1/health)" || fail "the application tunnel never became reachable"
say "backend address: $BACKEND_ADDRESS"

# ---------------------------------------------------------------------------
# Step 6 — a credential the product itself would accept
#
# Contract §2. A correctly-signed credential whose profile row does not exist
# gets 404 No such person and sign-in fails on the device: a signed token is not
# an identity. mint-device-token.ts writes the row through the API's own
# PersonRepository, which is why it is used instead of signing a JWT here.
# ---------------------------------------------------------------------------
STEP="6. mint a credential"
say "==> $STEP"
TOKEN="$(cd "$REPO_ROOT" && npx tsx apps/api/scripts/mint-device-token.ts session)" \
  || fail "could not mint a credential"
[ -n "$TOKEN" ] || fail "the credential was empty"

# ---------------------------------------------------------------------------
# Step 7 — PROVE the media address actually took
#
# Contract §1. Without this the failure mode is a session that serves the whole
# product correctly with EVERY IMAGE BLANK - which reads as a defect in the
# product and is not one, so the person debugging it looks in the wrong place.
# A check, not a comment.
# ---------------------------------------------------------------------------
STEP="7. verify issued media URLs are addressed to the media tunnel"
say "==> $STEP"
UPLOAD_JSON="$(curl -sf -X POST "http://127.0.0.1:3000/v1/media/uploads" \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"kind":"image","contentType":"image/jpeg","sizeBytes":1024}')" \
  || fail "could not create an upload target to check the media address"

ISSUED="$(printf '%s' "$UPLOAD_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).url??""))}catch{process.stdout.write("")}})')"
[ -n "$ISSUED" ] || fail "the upload target carried no URL: $UPLOAD_JSON"

case "$ISSUED" in
  "$MEDIA_ADDRESS"*) say "issued media URLs are addressed to $MEDIA_ADDRESS" ;;
  *) fail "media URLs are signed for the wrong host. Expected $MEDIA_ADDRESS, issued: ${ISSUED%%\?*}" ;;
esac

# ---------------------------------------------------------------------------
# Step 8 — the descriptor, where a phone can read it
#
# Contract §3. To the RENDERED SUMMARY, at the moment it is known. Job logs come
# back only as a tail and the artifact host is denied by egress in the
# environment this project is developed in; run 40 is recorded as "cause
# unknown" for exactly that reason. The owner reads this on a phone.
# ---------------------------------------------------------------------------
STEP="8. emit the descriptor"
EXPIRES_AT="$(date -u -d "+${LIFETIME_MINUTES} minutes" '+%Y-%m-%d %H:%M UTC')"

{
  printf '## Your session is ready\n\n'
  printf 'Open the app, paste the server address and the token into the sign-in screen.\n\n'
  printf '| | |\n|---|---|\n'
  printf '| **Server address** | `%s/v1` |\n' "$BACKEND_ADDRESS"
  printf '| **Expires** | %s (%s minutes) |\n' "$EXPIRES_AT" "$LIFETIME_MINUTES"
  printf '| Media is served from | `%s` — you never type this one |\n' "$MEDIA_ADDRESS"
  printf '\n**Token**\n\n```\n%s\n```\n\n' "$TOKEN"
  printf -- '---\n\n'
  printf 'This is a temporary development environment, not a deployment of the product.\n'
  printf 'It starts with an empty datastore, it is gone at the time above, and nothing in\n'
  printf 'it is durable.\n'
} >> "$SUMMARY"

say "==> session ready until $EXPIRES_AT"
printf '%s\n' "$BACKEND_ADDRESS/v1"
