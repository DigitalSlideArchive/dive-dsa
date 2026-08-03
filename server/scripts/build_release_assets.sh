#!/usr/bin/env bash
# Build front-end assets staged into the dive_server Python package for PyPI wheels.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CLIENT="$ROOT/client"
PLUGIN_CLIENT="$ROOT/server/dive_server/web_client"
DIVE_CLIENT="$ROOT/server/dive_server/dive_client"

echo "Building DIVE annotator SPA..."
cd "$CLIENT"
npm ci --no-audit --no-fund
VUE_APP_STATIC_PATH=/dive/static npm run build:web
rm -rf "$DIVE_CLIENT"
cp -r dist "$DIVE_CLIENT"

echo "Building DIVE Girder plugin web client..."
cd "$PLUGIN_CLIENT"
npm ci --no-audit --no-fund
SKIP_SOURCE_MAPS=1 npm run build

echo "Release assets ready under server/dive_server/{dive_client,web_client/dist}"
