#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

if [[ "${DATA_DIR:-}" != /* ]]; then
  export DATA_DIR="$ROOT_DIR/${DATA_DIR:-data}"
fi

if [[ "${UPLOAD_DIR:-}" != /* ]]; then
  export UPLOAD_DIR="$ROOT_DIR/${UPLOAD_DIR:-uploads}"
fi

wait_for_port() {
  local host="$1"
  local port="$2"
  local name="$3"
  local timeout_seconds="${4:-30}"
  local start_ts
  start_ts="$(date +%s)"

  while true; do
    if (echo >/dev/tcp/"$host"/"$port") >/dev/null 2>&1; then
      echo "$name is reachable at $host:$port"
      return 0
    fi

    if (( "$(date +%s)" - start_ts >= timeout_seconds )); then
      echo "Timed out waiting for $name at $host:$port" >&2
      return 1
    fi

    sleep 1
  done
}

if [[ "${SKIP_INFRA:-0}" != "1" ]]; then
  echo "Starting local infra (Postgres + Redis)..."
  docker compose -f infra/docker-compose.yml up -d

  # Default local infra endpoints used by this project.
  wait_for_port "127.0.0.1" "5432" "Postgres"
  wait_for_port "127.0.0.1" "6379" "Redis"
fi

cleanup() {
  kill "$API_PID" "$WORKER_PID" "$WEB_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

(
  cd api
  bun run dev
) &
API_PID=$!

(
  cd worker-jobs
  bun run dev
) &
WORKER_PID=$!

(
  cd web-app
  bun run dev
) &
WEB_PID=$!

wait
