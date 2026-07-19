# Girder 5 + DIVE as Python packages (wheel smoke test).
#
# Follows Girder 5 install guidance from https://github.com/girder/girder:
#   pip install girder
#   build core web client with Vite --base=/girder/
#   export GIRDER_STATIC_ROOT_DIR=...
#   pip install <plugin>
#
# DIVE ships its annotator SPA and Girder plugin UI *inside* the dive_server
# wheel (see server/scripts/build_release_assets.sh + hatch wheel includes).
# This Dockerfile stages those assets, builds the wheel, then installs it.
#
#   docker compose -f test_deployment/docker-compose.yml up --build

ARG GIRDER_VERSION=v5.0.12
ARG PYTHON_GIRDER=5.0.12

# ---------------------------------------------------------------------------
# DIVE annotator SPA → packaged at dive_server/dive_client/ → served at /dive
# ---------------------------------------------------------------------------
FROM node:20 AS dive-spa
WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
# Production base must match the CherryPy mount in dive_server/__init__.py
ENV VUE_APP_STATIC_PATH=/dive/static
RUN npm run build:web

# ---------------------------------------------------------------------------
# DIVE Girder plugin web client → dive_server/web_client/dist/
# (Girder 5: plugins own their Vite build; registerPluginStaticContent)
# ---------------------------------------------------------------------------
FROM node:20 AS dive-plugin-web
WORKDIR /app
COPY server/dive_server/web_client/package.json \
     server/dive_server/web_client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server/dive_server/web_client/ ./
ENV SKIP_SOURCE_MAPS=1
RUN npm run build

# ---------------------------------------------------------------------------
# Girder core web client (not part of dive_server; see Girder migration guide)
# ---------------------------------------------------------------------------
FROM node:20 AS girder-web
WORKDIR /app
RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*
ARG GIRDER_VERSION
RUN git clone --depth 1 --branch "${GIRDER_VERSION}" https://github.com/girder/girder.git
WORKDIR /app/girder/girder/web
RUN npm install --include=optional && npx vite build --base=/girder/

# ---------------------------------------------------------------------------
# Build dive_server wheel with SPA + plugin assets embedded
# ---------------------------------------------------------------------------
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS wheel-builder
WORKDIR /src
RUN apt-get update && \
    apt-get install -y --no-install-recommends git && \
    rm -rf /var/lib/apt/lists/*

COPY server/pyproject.toml server/uv.lock server/README.md ./
COPY server/dive_server ./dive_server
COPY server/dive_tasks ./dive_tasks
COPY server/dive_utils ./dive_utils
COPY server/scripts ./scripts

# Place built frontends where hatch packages them into the wheel.
# Do not copy .git here: dive_client/ is gitignored, and Hatchling would
# omit it from the wheel when VCS ignore is active. Version falls back to
# pyproject [tool.uv-dynamic-versioning] fallback-version.
COPY --from=dive-spa /app/dist/ ./dive_server/dive_client/
COPY --from=dive-plugin-web /app/dist/ ./dive_server/web_client/dist/

RUN uv build && ls -la dist/ && python - <<'PY'
from pathlib import Path
import zipfile

wheels = sorted(Path("dist").glob("dive_server-*.whl"))
assert wheels, "no wheel produced"
with zipfile.ZipFile(wheels[-1]) as zf:
    names = set(zf.namelist())
required = [
    "dive_server/dive_client/index.html",
    "dive_server/web_client/dist/girder-plugin-dive.umd.cjs",
    "dive_server/web_client/dist/style.css",
]
missing = [r for r in required if r not in names]
if missing:
    raise SystemExit("wheel missing bundled assets:\n" + "\n".join(missing))
print("wheel OK:", wheels[-1].name)
PY

# ---------------------------------------------------------------------------
# Runtime: girder (pip) + dive_server (wheel)
# ---------------------------------------------------------------------------
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS girder
ARG PYTHON_GIRDER

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates libgomp1 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV VIRTUAL_ENV=/opt/dive/venv
ENV PATH="/opt/dive/venv/bin:$PATH"
ENV GIT_PYTHON_REFRESH=quiet
# Girder 5: path to pre-built core web client (migration guide)
ENV GIRDER_STATIC_ROOT_DIR=/opt/dive/clients/girder

RUN uv venv "${VIRTUAL_ENV}"

COPY --from=wheel-builder /src/dist/dive_server-*.whl /tmp/wheels/
# Explicit girder install matches upstream docs; dive_server also depends on it.
RUN uv pip install "girder==${PYTHON_GIRDER}" /tmp/wheels/dive_server-*.whl && \
    rm -rf /tmp/wheels

RUN python - <<'PY'
from pathlib import Path
import dive_server

root = Path(dive_server.__file__).parent
required = [
    root / "dive_client" / "index.html",
    root / "web_client" / "dist" / "girder-plugin-dive.umd.cjs",
    root / "web_client" / "dist" / "style.css",
]
missing = [p for p in required if not p.is_file()]
if missing:
    raise SystemExit("Missing assets after pip install:\n" + "\n".join(map(str, missing)))
print("installed dive_server package OK at", root)
PY

COPY --from=girder-web /app/girder/girder/web/dist /opt/dive/clients/girder
COPY docker/server_setup.py /server_setup.py
COPY test_deployment/entrypoint_girder.sh /entrypoint_girder.sh
RUN chmod +x /entrypoint_girder.sh

EXPOSE 8080
ENTRYPOINT ["/entrypoint_girder.sh"]
CMD ["--mode", "production"]

# ---------------------------------------------------------------------------
# Runtime: Celery worker (same dive_server / dive_tasks wheel)
# ---------------------------------------------------------------------------
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS ffmpeg-builder
RUN apt-get update && \
    apt-get install -y --no-install-recommends wget tar xz-utils && \
    rm -rf /var/lib/apt/lists/*
RUN wget -q -O ffmpeg.tar.xz \
      https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz && \
    mkdir /tmp/ffextracted && \
    tar -xf ffmpeg.tar.xz -C /tmp/ffextracted --strip-components 1

FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS worker

RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates libgomp1 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY --from=ffmpeg-builder /tmp/ffextracted/ffmpeg /tmp/ffextracted/ffprobe /usr/local/bin/
RUN chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

ENV VIRTUAL_ENV=/opt/dive/venv
ENV PATH="/opt/dive/venv/bin:$PATH"
ENV GIT_PYTHON_REFRESH=quiet

RUN uv venv "${VIRTUAL_ENV}"

COPY --from=wheel-builder /src/dist/dive_server-*.whl /tmp/wheels/
RUN uv pip install /tmp/wheels/dive_server-*.whl && rm -rf /tmp/wheels
RUN python -c "import dive_tasks; print('dive_tasks OK')"
RUN ffmpeg -version >/dev/null && ffprobe -version >/dev/null

COPY test_deployment/entrypoint_worker.sh /entrypoint_worker.sh
RUN chmod +x /entrypoint_worker.sh

ENTRYPOINT ["/entrypoint_worker.sh"]
