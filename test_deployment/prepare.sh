#!/usr/bin/env bash
# Optional: build the dive_server wheel on the host (SPA + plugin UI embedded).
#
# Thin wrapper around server/scripts/build_wheel.sh. The primary Girder 5 package
# test stack builds this wheel inside Docker (see test_deployment/Dockerfile).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/server/scripts/build_wheel.sh" "$@"

echo ""
echo "Start the package test stack with:"
echo "  docker compose -f test_deployment/docker-compose.yml up --build"
