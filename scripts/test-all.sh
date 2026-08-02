#!/usr/bin/env bash
# Run the entire test suite — every augment-it vitest package, the E2E
# backend-chain integration, and id-didi-sh's ExUnit — in one go.
#
#   pnpm test:all            (from the augment-it root)
#   bash scripts/test-all.sh
#
# Turbo-free on purpose (turbo isn't a declared dep). Runs each suite
# sequentially so output is legible and nothing contends for the E2E's
# fixed ports. Prereqs for the E2E group: Docker running + the `surreal`
# CLI (both already on this machine). No test touches the shared cloud.

set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIDI="$ROOT/../id-didi-sh"
fail=0

run() {  # run <label> <dir> <cmd...>
  local label="$1" dir="$2"; shift 2
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $label"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  if ( cd "$dir" && "$@" ); then :; else echo "✗ $label FAILED"; fail=1; fi
}

# Clear any leftovers from a previously-interrupted E2E run.
lsof -ti:3199 2>/dev/null | xargs kill -9 2>/dev/null || true
docker rm -f augment-e2e-nats >/dev/null 2>&1 || true

run "Group C — transport (packages/workspace)"                    "$ROOT/packages/workspace"                pnpm test
run "Groups B/D/H — workspace-service"                            "$ROOT/services/workspace"                pnpm test
run "Groups E/J — resolver (canonical CRUD + alignment)"          "$ROOT/services/record-surrealdb-resolver" pnpm test
run "Group F — content-ingest (corpus files)"                     "$ROOT/services/content-ingest"           pnpm test
run "Group G — strategy-curator (Svelte 5 runes)"                 "$ROOT/apps/strategy-curator"             pnpm test
run "Group I — E2E backend-chain integration"                     "$ROOT/e2e"                               pnpm test

if command -v mix >/dev/null 2>&1 && [ -d "$DIDI" ]; then
  run "Group A — id-didi-sh (ExUnit)"                             "$DIDI"                                   env MIX_ENV=test mix test
else
  echo ""; echo "⚠  skipping Group A (id-didi-sh): mix not found or repo missing"
fi

# Teardown any E2E stragglers.
docker rm -f augment-e2e-nats >/dev/null 2>&1 || true
pkill -f "tsx src/server.ts" 2>/dev/null || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$fail" -eq 0 ]; then
  echo "  ✅ ALL SUITES PASSED"
else
  echo "  ❌ SOME SUITES FAILED (see ✗ markers above)"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Bonus (not part of pass/fail): the live corpora-alignment audit —"
echo "  node scripts/audit-corpora-alignment.mjs"
echo "reads the real cloud + disk read-only and flags drift; run it separately."

exit $fail
