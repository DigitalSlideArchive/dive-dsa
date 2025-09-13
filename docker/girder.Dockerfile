# ========================
# == CLIENT BUILD STAGE ==
# ========================
FROM node:20 AS client-builder
WORKDIR /app
SHELL ["/bin/bash", "-c"]

# Install dependencies
COPY client/package.json client/yarn.lock /app/
RUN yarn install --frozen-lockfile --network-timeout 300000
# Build
COPY .git/ /app/.git/
COPY client/ /app/
RUN yarn build:web

# ========================
# == SERVER BUILD STAGE ==
# ========================
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS server-builder
SHELL ["/bin/bash", "-c"]

WORKDIR /opt/dive/src

# Install only essential build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        build-essential \
        curl \
        git \
        pkg-config \
        libgomp1 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
ENV VIRTUAL_ENV="/opt/dive/local/venv"
ENV UV_PROJECT_ENVIRONMENT=/opt/dive/local/venv
ENV PATH="/opt/dive/local/venv/bin:$PATH"

# Create virtual environment
RUN uv venv /opt/dive/local/venv

# Copy dependency files first for better caching
COPY server/pyproject.toml /opt/dive/src/
COPY server/uv.lock /opt/dive/src/
COPY .git/ /opt/dive/src/.git/

# Install dependencies without SAM2 (web server doesn't need it)
RUN uv sync --frozen --no-install-project --no-dev

# Copy source and install project
COPY server/ /opt/dive/src/
RUN uv sync --frozen --no-dev

# Install Node.js for Girder build
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
RUN . ~/.bashrc && \
    nvm install 14 && \
    nvm alias default 14 && \
    nvm use default && \
    ln -s $(dirname `which npm`) /usr/local/node

ENV PATH="/usr/local/node:$PATH"
RUN girder build

# Clean up build artifacts and cache
RUN rm -rf /root/.cache /tmp/* /var/tmp/* && \
    find /opt/dive/local/venv -name "*.pyc" -delete && \
    find /opt/dive/local/venv -name "__pycache__" -type d -exec rm -rf {} + 2>/dev/null || true

# =================
# == DIST SERVER ==
# =================
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS server

# Install only runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libgomp1 \
        ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Hack: Tell GitPython to be quiet, we aren't using git
ENV GIT_PYTHON_REFRESH="quiet"
ENV PATH="/opt/dive/local/venv/bin:/usr/local/bin:$PATH"

# Copy only the essential parts from builder
COPY --from=server-builder /opt/dive/local/venv /opt/dive/local/venv
COPY --from=server-builder /opt/dive/src /opt/dive/src
COPY --from=client-builder /app/dist/ /opt/dive/local/venv/share/girder/static/dive/

# Copy uv binary for runtime use
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Install startup scripts
COPY docker/entrypoint_server.sh docker/server_setup.py /

# Create non-root user for security
RUN useradd --create-home --uid 1000 --shell=/bin/bash dive && \
    chown -R dive:dive /opt/dive

USER dive
ENTRYPOINT [ "/entrypoint_server.sh" ]
