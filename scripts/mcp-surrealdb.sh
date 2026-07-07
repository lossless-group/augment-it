#!/usr/bin/env bash
# Launches the surrealmcp Docker image against this repo's SurrealDB Cloud
# instance. Invoked by Claude Code as the `surrealdb` MCP server's command
# (see ../.mcp.json) — never run by hand.
#
# Sources .env relative to this script's own location (not $PWD) so it works
# regardless of which directory `claude` was started from, and independent
# of whether the launching shell happens to have SURREAL_* already exported.
# .env is gitignored; nothing here reads or writes secrets to a committed file.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

required=(SURREAL_URL SURREAL_NS SURREAL_DB SURREAL_USER SURREAL_PASS)
for var in "${required[@]}"; do
  if [ -z "${!var:-}" ]; then
    echo "mcp-surrealdb.sh: missing $var (checked $ENV_FILE)" >&2
    exit 1
  fi
done

exec docker run --rm -i --pull always \
  -e SURREALDB_URL="$SURREAL_URL" \
  -e SURREALDB_NS="$SURREAL_NS" \
  -e SURREALDB_DB="$SURREAL_DB" \
  -e SURREALDB_USER="$SURREAL_USER" \
  -e SURREALDB_PASS="$SURREAL_PASS" \
  surrealdb/surrealmcp:latest start
