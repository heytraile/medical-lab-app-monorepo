#!/usr/bin/env bash
# Inject secrets via Doppler when available; otherwise run the command bare.
# Usage: scripts/with-doppler.sh <command...>
set -euo pipefail

PROJECT="${DOPPLER_PROJECT:-drax-lis}"
CONFIG="${DOPPLER_CONFIG:-dev}"

if ! command -v doppler >/dev/null 2>&1; then
  echo "[with-doppler] Doppler CLI not found — running without secret injection." >&2
  echo "[with-doppler] Install: https://docs.doppler.com/docs/install-cli  (or use pnpm dev:bare)" >&2
  exec "$@"
fi

if ! doppler me >/dev/null 2>&1; then
  echo "[with-doppler] Not logged in to Doppler — running without secret injection." >&2
  echo "[with-doppler] Run: doppler login && doppler setup  (project ${PROJECT} / config ${CONFIG})" >&2
  exec "$@"
fi

if ! doppler secrets --only-names -p "$PROJECT" -c "$CONFIG" >/dev/null 2>&1; then
  echo "[with-doppler] Cannot read project '${PROJECT}' config '${CONFIG}' — running without secret injection." >&2
  echo "[with-doppler] Create the project in Doppler, then: doppler setup" >&2
  exec "$@"
fi

exec doppler run -p "$PROJECT" -c "$CONFIG" -- "$@"
