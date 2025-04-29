# ========================
# == CLIENT BUILD STAGE ==
# ========================
FROM node:20 as client-builder

WORKDIR /app

# Install dependencies
COPY client/package.json client/yarn.lock /app/
RUN yarn install --frozen-lockfile --network-timeout 300000

# Copy client source and git
COPY .git/ /app/.git/
COPY client/ /app/

# Build client
RUN yarn build:web

# ========================
# == SERVER BUILD STAGE ==
# ========================
FROM node:20 as server-node

WORKDIR /opt/dive/src/dive_server/web_client

# Install dependencies and build the girder client
COPY server/dive_server/web_client/package.json server/dive_server/web_client/package-lock.json ./
RUN npm install
COPY server/dive_server/web_client/ ./
RUN npm run build

# ========================
# == PYTHON SERVER BUILD ==
# ========================
FROM python:3.11-buster as server-builder

WORKDIR /opt/dive/src

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential libssl-dev libffi-dev python3-dev cargo

# Install Poetry
RUN curl -sSL https://install.python-poetry.org | POETRY_VERSION=1.7.0 POETRY_HOME=/opt/dive/poetry python -
ENV PATH="/opt/dive/poetry/bin:$PATH"

# Setup Python virtual environment
RUN python -m venv /opt/dive/local/venv
ENV VIRTUAL_ENV="/opt/dive/local/venv"
ENV PATH="/opt/dive/local/venv/bin:$PATH"

# Copy project files
COPY server/pyproject.toml /opt/dive/src/
COPY .git/ /opt/dive/src/.git/
RUN poetry env use system
RUN poetry config virtualenvs.create false
RUN poetry install --no-root

# Copy server source
COPY server/ /opt/dive/src/
RUN poetry install --only main

# Copy girder client (from node build stage)
COPY --from=server-node /opt/dive/src/dive_server/web_client/dist /opt/dive/clients/girder

# =================
# == FINAL SERVER ==
# =================
FROM python:3.11-slim-buster as server

ENV GIT_PYTHON_REFRESH="quiet"
ENV PATH="/opt/dive/local/venv/bin:$PATH"

# Copy Python venv and server code
COPY --from=server-builder /opt/dive/local/venv /opt/dive/local/venv
COPY --from=server-builder /opt/dive/src /opt/dive/src

# Copy built girder client
COPY --from=server-builder /opt/dive/clients/girder /opt/dive/clients/girder

# Copy DIVE VUE client
COPY --from=client-builder /app/dist/ /opt/dive/clients/dive
COPY --from=client-builder /app/dist/ /opt/dive/src/dive_server/dive_client

# Install startup scripts
COPY docker/entrypoint_server.sh docker/server_setup.py /

ENTRYPOINT [ "/entrypoint_server.sh" ]
