#!/usr/bin/env bash
#
# augment-it dev orchestrator — one command to bring the whole stack up,
# in the proper order.
#
#   ./scripts/dev.sh up        backend (Docker), wait for it, then frontend
#                              AND streams backend logs into the same terminal
#                              alongside frontend dev output. One tab, all logs.
#   ./scripts/dev.sh backend   backend only — Docker, detached
#   ./scripts/dev.sh frontend  frontend only — rsbuild dev servers
#   ./scripts/dev.sh down      stop the backend containers
#   ./scripts/dev.sh logs      follow backend container logs (standalone)
#   ./scripts/dev.sh ps        show backend container status
#
# Also wired as a pnpm script — `pnpm stack up`, `pnpm stack down`, etc.
#
# WHY TWO HALVES. The backend (NATS + the 7 services) runs in Docker;
# docker-compose `depends_on` handles its internal start order (every
# service waits on nats). The frontend remotes (shell :3100,
# record-collector :3002, prompt-template-manager :3003) are rsbuild dev
# servers — NOT dockerised — and run via pnpm. The services are deliberately
# excluded from the frontend command: a service started here AND in Docker
# would put two subscribers on the same NATS subjects, racing every request.
#
# ORDER. `up` starts the backend, waits until workspace-service answers on
# :3001, then starts the frontend. Module Federation loads remotes lazily,
# so the rsbuild servers can come up in any order among themselves.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."   # augment-it root

WORKSPACE_URL="http://localhost:3001/"

backend_up() {
  echo "▶ backend — docker compose up --build (rebuilds images so code changes land)"
  docker compose up --build -d
  echo "    searxng (pack search)   http://localhost:8080  (JSON: /search?q=test&format=json)"
}

wait_for_workspace() {
  echo "▶ waiting for workspace-service on :3001 …"
  for _ in $(seq 1 60); do
    # curl exits 0 once the server answers at all (a 404 is fine — it means
    # the HTTP listener is up); non-zero only on connection-refused.
    if curl -s -o /dev/null "$WORKSPACE_URL"; then
      echo "  ✓ workspace-service is up"
      return 0
    fi
    sleep 1
  done
  echo "  ⚠ workspace-service didn't answer in 60s — starting frontend anyway"
  echo "    (the workspace transport reconnects with backoff, so this is survivable)"
}

frontend_up() {
  echo "▶ frontend — rsbuild dev servers:"
  echo "    shell                   http://localhost:3100"
  echo "    record-collector        http://localhost:3002"
  echo "    prompt-template-manager http://localhost:3003"
  echo "    request-reviewer        http://localhost:3004"
  echo "    response-reviewer       http://localhost:3005"
  echo "    chat                    http://localhost:3006"
  echo "    enhanced-records-list   http://localhost:3007"
  echo "    pack-runner             http://localhost:3009"
  echo "    records-surface         http://localhost:3011"
  echo "  (Ctrl-C stops the frontend; the backend keeps running — './scripts/dev.sh down' to stop it)"
  pnpm --parallel --if-present \
    --filter './apps/*' --filter './shell' \
    run dev
}

# Stream backend container logs into the same terminal as the frontend dev
# output. Backend logs land with a [backend] prefix so they're distinguishable
# from frontend `apps/* dev:` lines. Started in the background and torn down
# with the script on Ctrl-C via the trap below.
backend_logs_attach() {
  # --no-log-prefix because we add our own [backend|<service>] prefix; the
  # service name is the more useful filter target than the bare container.
  # --since=0s replays only newly-arriving lines, not the full history every
  # time `up` runs (which would dump megabytes per restart cycle).
  docker compose logs -f --no-log-prefix --since=0s 2>&1 \
    | sed -u 's/^/[backend] /' &
  BACKEND_LOGS_PID=$!
}

trap_cleanup() {
  # Kill the backend-logs tail when the user Ctrl-Cs the foreground
  # frontend command. Does NOT stop the backend containers — `dev.sh down`
  # is the deliberate path for that, same as before this change.
  if [[ -n "${BACKEND_LOGS_PID:-}" ]] && kill -0 "$BACKEND_LOGS_PID" 2>/dev/null; then
    kill "$BACKEND_LOGS_PID" 2>/dev/null || true
  fi
}

case "${1:-up}" in
  up)
    backend_up
    wait_for_workspace
    trap trap_cleanup EXIT INT TERM
    backend_logs_attach
    frontend_up
    ;;
  backend)
    backend_up
    docker compose ps
    ;;
  frontend)
    frontend_up
    ;;
  down)
    echo "▶ docker compose down"
    docker compose down
    ;;
  logs)
    docker compose logs -f
    ;;
  ps)
    docker compose ps
    ;;
  *)
    echo "usage: dev.sh {up|backend|frontend|down|logs|ps}" >&2
    exit 1
    ;;
esac
