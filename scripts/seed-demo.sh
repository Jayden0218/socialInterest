#!/usr/bin/env bash
#
# Fill the backend with a product you can actually look at.
#
#   pnpm seed:demo "<the token pnpm mint:token printed>"
#
# Six people with bios and avatars, fourteen posts carrying real photographs
# across every interest, comments, reactions, follows both ways, two places with
# reviews, a saved collection and two conversations waiting in the inbox.
#
# WITHOUT THIS, a fresh backend has twelve catalogue interests and nothing else,
# so the first screen after signing in is an empty feed — which reads as a broken
# app and is not one.
#
set -Eeuo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Only the LOCAL run needs the env file, and only for the port. A remote seed
# reads nothing from this machine.
if [ -z "${E2E_BASE_URL:-}" ]; then
  [ -f .env.local ] || { echo "✗ .env.local does not exist — see docs/laptop-runbook.md" >&2; exit 1; }
  set -a
  # shellcheck disable=SC1091
  . ./.env.local
  set +a
fi

# A REMOTE ADDRESS IS ALLOWED NOW. The seeder stopped needing the datastore and
# the JWT secret when it moved to sign-up, so "the backend" no longer has to be
# the machine you are standing on. `E2E_BASE_URL` points it anywhere; unset, it
# is the local server exactly as before.
BASE_URL="${E2E_BASE_URL:-}"
PORT="${API_PORT:-3000}"
# Against the RUNNING server, not the datastore directly: the seed publishes
# through the app's own data layer, so a failure here is a failure a client
# would have had too.
TARGET="${BASE_URL:-http://127.0.0.1:${PORT}}"
curl -sf -o /dev/null --max-time 90 "${TARGET}/v1/health" || {
  if [ -n "$BASE_URL" ]; then
    echo "✗ ${TARGET}/v1/health did not answer. A sleeping free instance can take 30-60s to wake — try again." >&2
  else
    echo "✗ nothing is answering on port ${PORT}. Start it first, in another tab: pnpm laptop" >&2
  fi
  exit 1
}

cd apps/e2e
E2E_BASE_URL="$TARGET" exec npx tsx scripts/seed-demo.ts ${1:+"$1"}
