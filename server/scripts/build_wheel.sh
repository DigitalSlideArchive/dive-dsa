#!/usr/bin/env bash
# Build a dive-dsa wheel (import packages: dive_server, dive_tasks, …) with SPA +
# Girder plugin UI embedded, verify contents, and optionally publish to PyPI.
#
# Usage (from anywhere):
#   bash server/scripts/build_wheel.sh
#   bash server/scripts/build_wheel.sh --skip-assets
#   bash server/scripts/build_wheel.sh --version 1.2.3
#   UV_PUBLISH_TOKEN=pypi-... bash server/scripts/build_wheel.sh --version 1.2.3 --publish
#   bash server/scripts/build_wheel.sh --publish --dry-run
#
# Prerequisites: Node.js, npm, uv, and git history (for dynamic versioning,
# unless --version / UV_DYNAMIC_VERSIONING_BYPASS is set).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SERVER="$ROOT/server"
# PyPI / project name is dive-dsa; wheel filenames normalize to dive_dsa-*.
DIST_NAME="dive-dsa"
WHEEL_PREFIX="dive_dsa"

SKIP_ASSETS=0
PUBLISH=0
DRY_RUN=0
FORCE_VERSION=""

usage() {
  cat <<'EOF'
Usage: build_wheel.sh [options]

Build the dive-dsa distribution (SPA + plugin UI in the wheel), verify required
assets, then optionally publish with uv publish.

Options:
  --skip-assets       Skip frontend builds; reuse dive_client/ and web_client/dist/
  --version X.Y.Z     Force package version (sets UV_DYNAMIC_VERSIONING_BYPASS).
                      Leading 'v' is stripped. Required for publish when not on a tag.
  --publish           After a successful build, run uv publish
  --dry-run           With --publish, build and verify but do not upload
  -h, --help          Show this help

Local publish auth (pick one):
  export UV_PUBLISH_TOKEN=pypi-...          # preferred (PyPI API token)
  export UV_PUBLISH_USERNAME=__token__
  export UV_PUBLISH_PASSWORD=pypi-...

PyPI rejects local versions (+commit). Either:
  git tag vX.Y.Z && git push origin vX.Y.Z
  bash server/scripts/build_wheel.sh --publish
or force a clean version:
  bash server/scripts/build_wheel.sh --version 1.2.3 --publish

GitHub Actions uses Trusted Publishing (OIDC) and does not need these vars.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-assets) SKIP_ASSETS=1 ;;
    --publish) PUBLISH=1 ;;
    --dry-run) DRY_RUN=1 ;;
    --version)
      if [[ $# -lt 2 || -z "${2:-}" || "$2" == -* ]]; then
        echo "--version requires a value (e.g. --version 1.2.3)" >&2
        exit 2
      fi
      FORCE_VERSION="$2"
      shift
      ;;
    --version=*)
      FORCE_VERSION="${1#--version=}"
      ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [[ -n "$FORCE_VERSION" ]]; then
  # Accept v1.2.3 from tag-style args; package metadata must be unprefixed.
  FORCE_VERSION="${FORCE_VERSION#v}"
  if [[ "$FORCE_VERSION" == *+* ]]; then
    echo "Refusing --version '$FORCE_VERSION': local versions (+...) cannot be published to PyPI." >&2
    exit 2
  fi
  if [[ ! "$FORCE_VERSION" =~ ^[0-9] ]]; then
    echo "Refusing --version '$FORCE_VERSION': expected a PEP 440 version starting with a digit." >&2
    exit 2
  fi
  export UV_DYNAMIC_VERSIONING_BYPASS="$FORCE_VERSION"
  echo "Forcing package version: $FORCE_VERSION (UV_DYNAMIC_VERSIONING_BYPASS)"
fi

if [[ "$SKIP_ASSETS" -eq 0 ]]; then
  echo "Building front-end assets into server/dive_server/..."
  bash "$SERVER/scripts/build_release_assets.sh"
else
  echo "Skipping front-end builds (--skip-assets)"
fi

echo "Building ${DIST_NAME} wheel..."
cd "$SERVER"
# Clear stale artifacts so uv publish cannot upload an older local-version build.
rm -f dist/${WHEEL_PREFIX}-*.whl dist/${WHEEL_PREFIX}-*.tar.gz dist/${DIST_NAME}-*.tar.gz
# Also clear legacy dive_server-* names from before the rename.
rm -f dist/dive_server-*.whl dist/dive_server-*.tar.gz
uv build

WHEEL="$(ls -1t dist/${WHEEL_PREFIX}-*.whl 2>/dev/null | head -1 || true)"
SDIST="$(ls -1t dist/${WHEEL_PREFIX}-*.tar.gz dist/${DIST_NAME}-*.tar.gz 2>/dev/null | head -1 || true)"
if [[ -z "$WHEEL" || ! -f "$WHEEL" ]]; then
  echo "No ${DIST_NAME} wheel found under $SERVER/dist (expected ${WHEEL_PREFIX}-*.whl)" >&2
  exit 1
fi
if [[ -z "$SDIST" || ! -f "$SDIST" ]]; then
  echo "No ${DIST_NAME} sdist found under $SERVER/dist" >&2
  exit 1
fi

# Filename: dive_dsa-<version>-py3-none-any.whl
WHEEL_BASENAME="$(basename "$WHEEL")"
VERSION="${WHEEL_BASENAME#${WHEEL_PREFIX}-}"
VERSION="${VERSION%-py3-none-any.whl}"

if [[ -n "$FORCE_VERSION" && "$VERSION" != "$FORCE_VERSION" ]]; then
  echo "Built version '$VERSION' does not match --version '$FORCE_VERSION'" >&2
  exit 1
fi

echo ""
echo "Wheel ready: $WHEEL"
echo "Distribution: ${DIST_NAME} (${WHEEL_BASENAME})"
echo "Version: $VERSION"
echo "Contents check:"
python - <<PY
import sys
import zipfile
from pathlib import Path

whl = Path("${WHEEL}")
required = (
    "dive_server/dive_client/index.html",
    "dive_server/web_client/dist/girder-plugin-dive.umd.cjs",
    "dive_server/web_client/dist/style.css",
)
with zipfile.ZipFile(whl) as zf:
    names = set(zf.namelist())
missing = [r for r in required if r not in names]
for req in required:
    status = "OK" if req in names else "MISSING"
    print(f"  [{status}] {req}")
if missing:
    sys.exit("wheel missing bundled assets")
PY

if [[ "$PUBLISH" -eq 0 ]]; then
  echo ""
  echo "Build complete. To publish locally:"
  echo "  UV_PUBLISH_TOKEN=pypi-... bash server/scripts/build_wheel.sh --version X.Y.Z --publish"
  echo "Install with: pip install ${DIST_NAME}==${VERSION}"
  echo "Or tag a release / use a GitHub Release (Trusted Publishing)."
  exit 0
fi

# PyPI forbids PEP 440 local versions (+commit). Those appear when the checkout
# is not exactly on a version tag (e.g. 1.0.0.post311.dev0+1a3034f).
if [[ "$VERSION" == *+* ]]; then
  echo "" >&2
  echo "Refusing to publish version '$VERSION': PyPI does not allow local" >&2
  echo "version identifiers (+...). Either tag a release or force a version:" >&2
  echo "  bash server/scripts/build_wheel.sh --version X.Y.Z --publish" >&2
  echo "Current describe: $(git -C "$ROOT" describe --tags --always 2>/dev/null || echo unknown)" >&2
  exit 1
fi

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo ""
  echo "Dry run: would publish ${DIST_NAME}==${VERSION}:"
  echo "  $WHEEL"
  echo "  $SDIST"
  exit 0
fi

if [[ -z "${UV_PUBLISH_TOKEN:-}" && -z "${UV_PUBLISH_PASSWORD:-}" ]]; then
  # OIDC trusted publishing (CI) needs no token; local publish does.
  if [[ -z "${CI:-}" && -z "${GITHUB_ACTIONS:-}" ]]; then
    echo "Set UV_PUBLISH_TOKEN (or UV_PUBLISH_USERNAME/PASSWORD) before --publish." >&2
    echo "See: https://docs.astral.sh/uv/guides/package/#publishing-your-package" >&2
    exit 1
  fi
fi

echo ""
echo "Publishing ${DIST_NAME}==${VERSION} to PyPI with uv publish..."
# Publish only the artifacts from this build (dist was cleaned above).
uv publish "$WHEEL" "$SDIST"
echo "Publish complete."
