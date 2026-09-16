#!/usr/bin/env bash
#
# Run the API on your own machine, against Supabase, reachable from your phone.
#
# WHAT THIS IS FOR: the product's data and photographs live in Supabase; this
# runs the one piece that has to be a running process. There is no database and
# no object storage on your laptop — just Node, about 155 MB of it, measured.
#
# WHAT IT IS NOT: a deployment. Close the lid and the backend is gone. That is
# the whole trade, and it is a fine one while you are building.
#
#   scripts/laptop-up.sh
#
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

say()  { printf '%s\n' "$*" >&2; }
fail() { say ""; say "✗ $1"; say ""; exit 1; }

# ---------------------------------------------------------------------------
# 1. Prerequisites, each with the command that fixes it
#
# Named individually rather than "something is missing". A setup script that
# says "failed" has told you nothing you could not see; the value is in saying
# WHICH thing and WHAT to type.
# ---------------------------------------------------------------------------
command -v node >/dev/null 2>&1 || fail "node is not installed.   macOS: brew install node@22"
command -v pnpm >/dev/null 2>&1 || fail "pnpm is not installed.   macOS: brew install pnpm"
command -v ffmpeg >/dev/null 2>&1 || fail "ffmpeg is not installed. macOS: brew install ffmpeg
  The API strips GPS metadata out of every photograph server-side (FR-010) and
  reads its dimensions, so nothing can be published without it."
command -v ffprobe >/dev/null 2>&1 || fail "ffprobe is missing — it ships with ffmpeg. macOS: brew install ffmpeg"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 22 ] || fail "node $NODE_MAJOR is too old; this needs 22 or newer. macOS: brew install node@22"

# ---------------------------------------------------------------------------
# 2. Configuration, from a file git will never see
#
# `.env.local` is gitignored. Credentials belong in the environment, never in
# the repository — the same rule that removed LOCAL_JWT_SECRET's default after
# the old one turned out to be a constant anybody reading this repository could
# use to mint a token the service would accept.
# ---------------------------------------------------------------------------
[ -f .env.local ] || fail ".env.local does not exist.
  Copy the template and fill it in:

      cp .env.local.example .env.local

  It holds your Supabase connection string and storage keys. It is gitignored;
  do not put these values in any file that is not."

set -a
# shellcheck disable=SC1091
. ./.env.local
set +a

# S3_REGION IS ON THIS LIST BECAUSE ITS DEFAULT IS WORSE THAN NOTHING.
#
# `configuration.ts` falls back to `local`, which is right for MinIO and wrong
# for every real S3 service — a SigV4 signature covers the region, so a mismatch
# is refused as `SignatureDoesNotMatch`. That surfaces as uploads failing with a
# message about signatures, which sends you looking at your keys.
#
# A default that is silently wrong for the backend you configured is worse than
# an absent one: the absent one stops you here, by name.
for required in DATABASE_URL S3_ENDPOINT S3_REGION S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY MEDIA_BUCKET; do
  [ -n "${!required:-}" ] || fail "$required is not set in .env.local"
done

# FR-015. Its own secret, and no default anywhere: the published one was a
# constant in this repository. Generated once and kept, so tokens survive a
# restart — a new secret every run would sign you out of your phone each time.
if [ -z "${LOCAL_JWT_SECRET:-}" ]; then
  fail "LOCAL_JWT_SECRET is not set in .env.local.
  Generate one and paste it in:

      openssl rand -hex 32"
fi

# ---------------------------------------------------------------------------
# 3. The address your phone will use
#
# NOT localhost. To the phone, `localhost` is the PHONE — which is the same
# class of mistake as signing media URLs against 127.0.0.1, where the emulator
# resolved it to its own loopback and every image came up blank.
# ---------------------------------------------------------------------------
# Ask the routing table which interface actually reaches the network, rather
# than hardcoding en0. `en0` is Wi-Fi on most Macs and Ethernet on others, and a
# dock or a VPN moves it again — a guess here produces an address that resolves
# to nothing, which is worse than no address at all.
LAN_IFACE="$(route -n get default 2>/dev/null | awk '/interface:/{print $2}' || true)"
LAN_IP=""
[ -n "$LAN_IFACE" ] && LAN_IP="$(ipconfig getifaddr "$LAN_IFACE" 2>/dev/null || true)"
[ -n "$LAN_IP" ] || LAN_IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
[ -n "$LAN_IP" ] || LAN_IP="$(ifconfig 2>/dev/null | awk '/inet /{if ($2 != "127.0.0.1") {print $2; exit}}' || true)"
[ -n "$LAN_IP" ] || LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
[ -n "$LAN_IP" ] || fail "could not work out this machine's address on the network.
  Are you connected to Wi-Fi? System Settings → Network → Wi-Fi → Details → TCP/IP."

PORT="${API_PORT:-3000}"

# S3_PUBLIC_ENDPOINT is what MEDIA URLS ARE SIGNED AGAINST, and a presigned
# signature covers the host — a URL signed for the wrong address cannot be
# repaired by rewriting it afterwards. With Supabase both addresses are the
# same public one, so this defaults to the endpoint rather than to a guess.
export S3_PUBLIC_ENDPOINT="${S3_PUBLIC_ENDPOINT:-$S3_ENDPOINT}"
export S3_FORCE_PATH_STYLE="${S3_FORCE_PATH_STYLE:-true}"
export RUNTIME_PROFILE=local
export API_PORT="$PORT"

# ---------------------------------------------------------------------------
# 4. Schema, then the application
#
# In that order, and it is not arbitrary: the interest catalogue is loaded into
# an in-memory cache by onModuleInit, so an application started against an empty
# schema holds an empty catalogue and nothing can be posted to.
# ---------------------------------------------------------------------------
say "==> preparing the schema in Supabase (safe to re-run)"
pnpm --filter @sih/infra db:create-local-pg >/dev/null

say ""
say "  ┌──────────────────────────────────────────────────────────────"
say "  │  Server address, to type into the app once:"
say "  │"
say "  │      http://${LAN_IP}:${PORT}/v1"
say "  │"
say "  │  Your phone must be on the same Wi-Fi. Stop with Ctrl-C."
say "  └──────────────────────────────────────────────────────────────"
say ""

exec pnpm --filter @sih/api dev
