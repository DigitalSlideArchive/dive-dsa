#!/usr/bin/env bash
# Optional: build the dive_server wheel on the host (SPA + plugin UI embedded).
#
# The primary Girder 5 package test stack builds this wheel inside Docker
# (see test_deployment/Dockerfile). Use this script to inspect the wheel locally
# or to feed CI checks.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "Building front-end assets into server/dive_server/..."
bash "$ROOT/server/scripts/build_release_assets.sh"

echo "Building dive_server wheel..."
cd "$ROOT/server"
uv build

WHEEL="$(ls -1 dist/dive_server-*.whl | tail -1)"
echo ""
echo "Wheel ready: $WHEEL"
echo "Contents check:"
python - <<PY
import zipfile
from pathlib import Path
whl = Path("${WHEEL}")
with zipfile.ZipFile(whl) as zf:
    names = set(zf.namelist())
for req in (
    "dive_server/dive_client/index.html",
    "dive_server/web_client/dist/girder-plugin-dive.umd.cjs",
    "dive_server/web_client/dist/style.css",
):
    status = "OK" if req in names else "MISSING"
    print(f"  [{status}] {req}")
PY
echo ""
echo "Start the package test stack with:"
echo "  docker compose -f test_deployment/docker-compose.yml up --build"
