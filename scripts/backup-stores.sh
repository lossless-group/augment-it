#!/usr/bin/env bash
#
# backup-stores.sh — snapshot every JSON-file store into .backups/ with a
# timestamped subdirectory. Reads files via `docker cp` from the running
# containers, so the live data is captured (not the stub copies in the
# tracked services/*/data/ paths).
#
# Stores covered:
#   - response-store/data/responses.json
#   - row-store/data/rows.json
#   - prompt-store/data/prompts.json
#   - workspace-service/data/sessions.json (auth tokens; treat as sensitive)
#
# Usage:
#   ./scripts/backup-stores.sh                  → snapshot to .backups/<stamp>/
#   ./scripts/backup-stores.sh restore <stamp>  → copy a snapshot back into containers
#
# Restore mode requires the services that own the files to be stopped or
# willing to absorb a re-load (response-store + row-store re-read on each
# write, so docker cp followed by a request that triggers persist is the
# usual path — easiest is just to restart the touched containers).

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."   # augment-it root

BACKUPS_DIR=".backups"
STAMP="$(date +%Y-%m-%d_%H%M%S)"

declare -A STORES=(
  ["response-store"]="responses.json"
  ["row-store"]="rows.json"
  ["prompt-store"]="prompts.json"
  ["workspace-service"]="sessions.json"
)

backup() {
  local dest="$BACKUPS_DIR/$STAMP"
  mkdir -p "$dest"
  echo "▶ snapshot → $dest"
  for service in "${!STORES[@]}"; do
    local file="${STORES[$service]}"
    local container="augment-it-${service}-1"
    if docker cp "$container:/data/$file" "$dest/$file" 2>/dev/null; then
      local bytes
      bytes=$(wc -c < "$dest/$file")
      echo "  ✓ $service/$file  ($bytes bytes)"
    else
      echo "  ✗ $service/$file — copy failed (container not running?)"
    fi
  done
  # Tiny manifest so future-you knows what's in this snapshot
  {
    echo "augment-it data snapshot · $STAMP"
    echo "branch: $(git rev-parse --abbrev-ref HEAD)"
    echo "head:   $(git rev-parse --short HEAD)"
    echo "msg:    $(git log -1 --format=%s)"
    echo ""
    echo "files:"
    for service in "${!STORES[@]}"; do
      echo "  $service/${STORES[$service]}"
    done
  } > "$dest/MANIFEST.txt"
  echo ""
  echo "Wrote $dest/MANIFEST.txt"
  echo "To restore later: ./scripts/backup-stores.sh restore $STAMP"
}

restore() {
  local src_stamp="${1:?usage: restore <stamp>}"
  local src="$BACKUPS_DIR/$src_stamp"
  if [[ ! -d "$src" ]]; then
    echo "✗ snapshot not found: $src" >&2
    exit 1
  fi
  echo "▶ restore ← $src"
  for service in "${!STORES[@]}"; do
    local file="${STORES[$service]}"
    local container="augment-it-${service}-1"
    if [[ -f "$src/$file" ]]; then
      if docker cp "$src/$file" "$container:/data/$file" 2>/dev/null; then
        echo "  ✓ $service/$file"
      else
        echo "  ✗ $service/$file — copy failed (container not running?)"
      fi
    fi
  done
  echo ""
  echo "Now restart the affected containers so they re-read on next access:"
  echo "  docker compose restart response-store row-store prompt-store workspace-service"
}

case "${1:-backup}" in
  backup)  backup ;;
  restore) restore "${2:-}" ;;
  *)       echo "usage: $0 [backup|restore <stamp>]" >&2; exit 1 ;;
esac
