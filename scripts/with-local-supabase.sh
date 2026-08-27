#!/usr/bin/env bash
# Inject the local Supabase CLI stack env, then run the given command.
# Usage: scripts/with-local-supabase.sh <command...>
#
# Counterpart to scripts/with-doppler.sh: that one pulls real cloud secrets,
# this one wires the throwaway Docker stack on localhost. See docs/LOCAL_DEV.md.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT}/supabase/local.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[local-supabase] Missing ${ENV_FILE}" >&2
  exit 1
fi

# Committed defaults. Anything already exported in the shell wins, so you can
# override a single value ad hoc: SUPABASE_URL=… pnpm dev:local
while IFS= read -r line || [[ -n "$line" ]]; do
  [[ -z "${line// }" || "$line" == \#* ]] && continue
  key="${line%%=*}"
  [[ -z "$key" || "$key" == "$line" ]] && continue
  if [[ -z "${!key:-}" ]]; then
    export "$key=${line#*=}"
  fi
done <"$ENV_FILE"

if ! curl -sf -o /dev/null --max-time 2 "${SUPABASE_URL}/auth/v1/health"; then
  echo "[local-supabase] Supabase stack not reachable at ${SUPABASE_URL}" >&2
  echo "[local-supabase] Start it first: pnpm supabase:start" >&2
  echo "[local-supabase] Continuing anyway — the API will fall back to its in-memory store." >&2
fi

exec "$@"
