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

# 30 days, not the 2 hours a CI device pass wants. Two hours on a laptop means
# the phone signs itself out over lunch, and "the app stopped working" is
# indistinguishable from the backend being down.
TOKEN="$(TOKEN_TTL="${TOKEN_TTL:-30d}" npx tsx apps/api/scripts/mint-device-token.ts "${1:-me}")"

# The same address `pnpm laptop` prints, worked out the same way — from the
# routing table rather than a hardcoded en0, which is Wi-Fi on most Macs and
# Ethernet on others.
LAN_IFACE="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}' || true)"
LAN_IP=""
[ -n "$LAN_IFACE" ] && LAN_IP="$(ipconfig getifaddr "$LAN_IFACE" 2>/dev/null || true)"
[ -n "$LAN_IP" ] || LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
[ -n "$LAN_IP" ] || LAN_IP="$(ifconfig 2>/dev/null | awk '/inet /{if ($2 != "127.0.0.1") {print $2; exit}}' || true)"
[ -n "$LAN_IP" ] || LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
ADDRESS="http://${LAN_IP}:${API_PORT:-3000}/v1"

{
  printf '\n  Scan with the phone'\''s ORDINARY camera — not Expo. It holds the TOKEN,\n'
  printf '  which is the part you cannot type. The address below is short; type that.\n\n'
  npx tsx apps/api/scripts/pair-qr.ts "$ADDRESS" "$TOKEN" 2>/dev/null || \
    printf '  (could not render a QR code — use the values below)\n'
  printf '\n  Server address  %s\n' "$ADDRESS"
  printf '  Token           %s\n\n' "$TOKEN"
  printf '  Copy just the token to the clipboard:  pnpm --silent token | pbcopy\n\n'
} >&2

# The token alone on stdout, so `pnpm --silent token | pbcopy` copies the token
# and not the banner around it.
printf '%s\n' "$TOKEN"
