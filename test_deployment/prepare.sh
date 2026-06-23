#!/usr/bin/env bash
# Build the dive_server wheel on the host for test_deployment docker compose.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Building front-end assets..."
bash "$ROOT/server/scripts/build_release_assets.sh"

echo "Building dive_server wheel..."
cd "$ROOT/server"
uv build

WHEEL="$(ls -1 dist/dive_server-*.whl | tail -1)"
echo ""
echo "Wheel ready: $WHEEL"
echo "Start the test stack with:"
echo "  docker compose -f test_deployment/docker-compose.yml up --build"
