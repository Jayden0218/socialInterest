#!/usr/bin/env bash
# Loads .env.local, then runs the checks. See apps/api/scripts/doctor.ts.
set -Eeuo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"
[ -f .env.local ] || { echo "✗ .env.local does not exist. cp .env.local.example .env.local" >&2; exit 1; }
set -a
# shellcheck disable=SC1091
. ./.env.local
set +a
for required in DATABASE_URL S3_ENDPOINT S3_REGION S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY MEDIA_BUCKET LOCAL_JWT_SECRET; do
  [ -n "${!required:-}" ] || { echo "✗ $required is not set in .env.local" >&2; exit 1; }
done
# Run from apps/api: that is where `pg` and the S3 SDK are declared, and where
# the tsconfig enabling decorators lives. The script imports the product's own
# adapter, so it has to resolve exactly what the product resolves.
cd apps/api
exec npx tsx scripts/doctor.ts
