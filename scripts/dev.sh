#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(pwd)"

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
