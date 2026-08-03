# ========================
# == CLIENT BUILD STAGE ==
# ========================
FROM node:20 AS client-builder
WORKDIR /app
SHELL ["/bin/bash", "-c"]

# Install dependencies
COPY client/package.json client/package-lock.json /app/
RUN npm ci --no-audit --no-fund
# Build
COPY .git/ /app/.git/
COPY client/ /app/
RUN npm run build:web

FROM node:20 AS girder-client-builder
WORKDIR /app
RUN apt-get update && apt-get install -y git
ARG CACHEBUST=2
RUN git clone https://github.com/girder/girder.git
RUN cd girder/girder && cd web && npm install --include=optional && npx vite build --base=/girder/

FROM node:20 AS dive-plugin-client-builder
WORKDIR /opt/dive/src/dive_server/web_client
COPY server/dive_server/web_client/package.json server/dive_server/web_client/package-lock.json ./
RUN npm install
COPY server/dive_server/web_client/ ./
RUN npm run build

# ========================
# == SERVER BUILD STAGE ==
# ========================
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS server-builder
SHELL ["/bin/bash", "-c"]

WORKDIR /opt/dive/src
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      curl git build-essential pkg-config libgomp1 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
ENV VIRTUAL_ENV="/opt/dive/local/venv"
ENV UV_PROJECT_ENVIRONMENT=/opt/dive/local/venv
ENV PATH="/opt/dive/local/venv/bin:$PATH"
RUN uv venv /opt/dive/local/venv

COPY server/pyproject.toml server/uv.lock /opt/dive/src/
COPY .git/ /opt/dive/src/.git/
RUN uv sync --frozen --no-install-project --no-dev

COPY server/ /opt/dive/src/
RUN uv sync --frozen --no-dev

# =================
# == DIST SERVER ==
# =================
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS server

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libgomp1 \
        ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ENV GIT_PYTHON_REFRESH="quiet"
ENV VIRTUAL_ENV="/opt/dive/local/venv"
ENV UV_PROJECT_ENVIRONMENT=/opt/dive/local/venv
ENV PATH="/opt/dive/local/venv/bin:/usr/local/bin:$PATH"

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY --from=server-builder /opt/dive/local/venv /opt/dive/local/venv
COPY --from=server-builder /opt/dive/src /opt/dive/src
COPY --from=client-builder /app/dist/ /opt/dive/clients/dive
COPY --from=client-builder /app/dist/ /opt/dive/src/dive_server/dive_client
COPY --from=girder-client-builder /app/girder/girder/web/dist/ /opt/dive/clients/girder
COPY --from=dive-plugin-client-builder /opt/dive/src/dive_server/web_client/dist /opt/dive/clients/dive-plugin-web-client
COPY --from=dive-plugin-client-builder /opt/dive/src/dive_server/web_client/dist /opt/dive/src/dive_server/web_client/dist
COPY docker/entrypoint_server.sh docker/server_setup.py /

RUN useradd --create-home --uid 1000 --shell=/bin/bash dive && \
    chown -R dive:dive /opt/dive

ENTRYPOINT [ "/entrypoint_server.sh" ]
