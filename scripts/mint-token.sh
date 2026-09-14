#!/usr/bin/env bash
#
# Mint a sign-in token for your phone, against the backend `pnpm laptop` runs.
#
#   pnpm token            # or: scripts/mint-token.sh [handle]
#
# A SIGNED TOKEN IS NOT AN IDENTITY, which is the whole reason this wraps a
# script rather than signing a JWT inline. There is no signup endpoint on this
# profile: identity comes from the issuer, and the profile row that token refers
# to has to EXIST or `GET /v1/me` answers 404 "No such person" and sign-in fails
# on the device. `mint-device-token.ts` writes the row through the API's own
# repository, so the shape is the product's rather than a second copy of it.
#
set -Eeuo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

[ -f .env.local ] || { echo "✗ .env.local does not exist — see docs/laptop-runbook.md" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env.local
set +a

# The same secret the running API validates against. A token minted with a
# different one is refused, and the failure reads as "wrong token" rather than
# "wrong secret" — which sends you looking in the wrong place.
[ -n "${LOCAL_JWT_SECRET:-}" ] || { echo "✗ LOCAL_JWT_SECRET is not set in .env.local" >&2; exit 1; }
[ -n "${DATABASE_URL:-}" ] || { echo "✗ DATABASE_URL is not set in .env.local" >&2; exit 1; }

TOKEN="$(npx tsx apps/api/scripts/mint-device-token.ts "${1:-me}")"

cat >&2 <<MSG

  ┌──────────────────────────────────────────────────────────────
  │  Paste this into the app's second field, with the address
  │  \`pnpm laptop\` printed in the first.
  └──────────────────────────────────────────────────────────────

MSG
printf '%s\n' "$TOKEN"
