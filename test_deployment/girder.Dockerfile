# Install Girder 5 + a pre-built dive_server wheel from the host.
# Build the wheel on the host first (see test_deployment/prepare.sh).
#
#   bash test_deployment/prepare.sh
#   docker compose -f test_deployment/docker-compose.yml up --build

# Girder core web client (not bundled in the dive_server wheel).
FROM node:20 AS girder-client-builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends git && rm -rf /var/lib/apt/lists/*
ARG GIRDER_VERSION=v5.0.12
RUN git clone --depth 1 --branch "${GIRDER_VERSION}" https://github.com/girder/girder.git
RUN cd girder/girder/web && npm install --include=optional && npx vite build --base=/girder/

FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      libgomp1 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV VIRTUAL_ENV=/opt/dive/venv
ENV PATH="/opt/dive/venv/bin:$PATH"
ENV GIT_PYTHON_REFRESH=quiet
ENV GIRDER_STATIC_ROOT_DIR=/opt/dive/clients/girder

RUN uv venv "${VIRTUAL_ENV}"

# Wheel must be built on the host before `docker compose build`.
COPY server/dist/dive_server-*.whl /tmp/wheels/
RUN uv pip install "girder==5.0.12" /tmp/wheels/dive_server-*.whl && rm -rf /tmp/wheels

RUN python - <<'PY'
from pathlib import Path
import dive_server

root = Path(dive_server.__file__).parent
required = [
    root / "dive_client" / "index.html",
    root / "web_client" / "dist" / "girder-plugin-dive.umd.cjs",
    root / "web_client" / "dist" / "style.css",
]
missing = [path for path in required if not path.is_file()]
if missing:
    raise SystemExit("Missing bundled assets in installed wheel:\n" + "\n".join(str(p) for p in missing))
print("dive_server wheel bundle OK")
PY

COPY --from=girder-client-builder /app/girder/girder/web/dist /opt/dive/clients/girder
COPY docker/server_setup.py /server_setup.py
COPY test_deployment/entrypoint_girder.sh /entrypoint_girder.sh
RUN chmod +x /entrypoint_girder.sh

EXPOSE 8080
ENTRYPOINT ["/entrypoint_girder.sh"]
CMD ["--mode", "production"]
