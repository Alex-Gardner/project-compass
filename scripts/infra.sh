#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/infra"

case "${1:-}" in
  up)
    docker compose up -d
    docker compose ps
    ;;
  down)
    docker compose down
    ;;
  ps)
    docker compose ps
    ;;
  logs)
    docker compose logs --tail=100
    ;;
  *)
    echo "Usage: scripts/infra.sh {up|down|ps|logs}" >&2
    exit 1
    ;;
esac
