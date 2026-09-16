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

[ -n "${1:-}" ] || { echo "usage: pnpm seed:demo \"<token>\"   (get one from: pnpm mint:token)" >&2; exit 2; }
[ -f .env.local ] || { echo "✗ .env.local does not exist — see docs/laptop-runbook.md" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env.local
set +a

PORT="${API_PORT:-3000}"
# Against the RUNNING server, not the datastore directly: the seed publishes
# through the app's own data layer, so a failure here is a failure a client
# would have had too.
curl -sf -o /dev/null "http://127.0.0.1:${PORT}/v1/health" || {
  echo "✗ nothing is answering on port ${PORT}. Start it first, in another tab: pnpm laptop" >&2
  exit 1
}

cd apps/e2e
E2E_BASE_URL="http://127.0.0.1:${PORT}" exec npx tsx scripts/seed-demo.ts "$1"
