#!/usr/bin/env bash
# Restore edge-engine SQLite from a timestamped backup file.
# Usage: ./restore-edge-db.sh /path/to/edge-YYYYMMDD-HHMMSS.db [container-name]
set -euo pipefail

BACKUP_FILE="${1:-}"
CONTAINER="${2:-infra-lab-1}"

if [[ -z "$BACKUP_FILE" || ! -f "$BACKUP_FILE" ]]; then
  echo "Usage: $0 <backup.db> [docker-container-name]" >&2
  exit 1
fi

DB_PATH="/data/edge.db"

echo "This will STOP the lab container, overwrite ${DB_PATH}, and restart."
echo "Backup source: ${BACKUP_FILE}"
echo "Container:     ${CONTAINER}"
read -r -p "Type RESTORE to continue: " confirm
if [[ "$confirm" != "RESTORE" ]]; then
  echo "Aborted."
  exit 1
fi

echo "Stopping ${CONTAINER}..."
docker stop "$CONTAINER"

echo "Copying backup into container..."
docker cp "$BACKUP_FILE" "${CONTAINER}:${DB_PATH}"

echo "Starting ${CONTAINER}..."
docker start "$CONTAINER"

echo "Done. Verify with: docker logs -f ${CONTAINER}"
