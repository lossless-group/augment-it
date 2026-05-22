#!/usr/bin/env bash
#
# augment-it dev orchestrator — one command to bring the whole stack up,
# in the proper order.
#
#   ./scripts/dev.sh up        backend (Docker), wait for it, then frontend
#   ./scripts/dev.sh backend   backend only — Docker, detached
#   ./scripts/dev.sh frontend  frontend only — rsbuild dev servers
#   ./scripts/dev.sh down      stop the backend containers
#   ./scripts/dev.sh logs      follow backend container logs
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
  echo "  (Ctrl-C stops the frontend; the backend keeps running — './scripts/dev.sh down' to stop it)"
  pnpm --parallel --if-present \
    --filter './apps/*' --filter './shell' \
    run dev
}

case "${1:-up}" in
  up)
    backend_up
    wait_for_workspace
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
