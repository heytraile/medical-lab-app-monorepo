#!/usr/bin/env bash
# Wipe local Supabase + edge SQLite, re-apply schemas, optionally seed demo data.
#
# Usage:
#   scripts/reseed-local.sh           # reset DBs only (restart dev + seed manually)
#   scripts/reseed-local.sh --seed    # also wait for edge and POST demo fixtures
#
# Stop `pnpm dev:local` first — SQLite cannot be deleted while edge-engine is running.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SEED=false
for arg in "$@"; do
  case "$arg" in
    --seed) SEED=true ;;
    -h|--help)
      echo "Usage: scripts/reseed-local.sh [--seed]"
      echo "  --seed  Wait for edge-engine and run patients + demo/bench seed"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

EDGE_DB="${ROOT}/apps/edge-engine/dev.db"
EDGE_URL="${EDGE_URL:-http://localhost:3101}"

echo "[reseed] Resetting local Supabase (migrations + seed.sql)…"
pnpm supabase:reset

echo "[reseed] Wiping edge SQLite at ${EDGE_DB}…"
if [[ -f "$EDGE_DB" ]]; then
  rm -f "$EDGE_DB"
fi

echo "[reseed] Applying Prisma schema to fresh SQLite…"
pnpm db:push:bare

if [[ "$SEED" != true ]]; then
  cat <<EOF

[reseed] Database reset complete.

Next steps:
  1. Start the stack:  pnpm dev:local
  2. Seed demo data:
       curl -X POST ${EDGE_URL}/patients/seed
       curl -X POST ${EDGE_URL}/demo/bench

Staff accounts and messaging channels seed automatically on edge first boot.
Outbox sync pushes edge data to local Supabase within a few seconds.

Or run this script with --seed after dev:local is already running.

EOF
  exit 0
fi

echo "[reseed] Waiting for edge-engine at ${EDGE_URL}/health …"
for _ in $(seq 1 60); do
  if curl -sf -o /dev/null --max-time 2 "${EDGE_URL}/health"; then
    break
  fi
  sleep 2
done

if ! curl -sf -o /dev/null --max-time 2 "${EDGE_URL}/health"; then
  echo "[reseed] edge-engine not reachable. Start pnpm dev:local, then run:" >&2
  echo "  curl -X POST ${EDGE_URL}/patients/seed" >&2
  echo "  curl -X POST ${EDGE_URL}/demo/bench" >&2
  exit 1
fi

echo "[reseed] Seeding patients…"
curl -sf -X POST "${EDGE_URL}/patients/seed" | head -c 500
echo ""

echo "[reseed] Seeding demo bench (specimens + results with specimen IDs)…"
curl -sf -X POST "${EDGE_URL}/demo/bench" | head -c 500
echo ""

echo "[reseed] Done. Demo barcodes use specimen IDs (e.g. DHDEMO0001-01). Cloud syncs via outbox."
