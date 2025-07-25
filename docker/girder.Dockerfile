# ========================
# == CLIENT BUILD STAGE ==
# ========================
FROM node:20 as client-builder
WORKDIR /app

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
# Note: server-builder stage will be the same in both dockerfiles
FROM python:3.11-buster as server-builder

WORKDIR /opt/dive/src

# https://cryptography.io/en/latest/installation/#debian-ubuntu
RUN apt-get update
RUN apt-get install -y build-essential libssl-dev libffi-dev python3-dev cargo npm libgl1
# Recommended poetry install https://python-poetry.org/docs/master/#installation
RUN curl -sSL https://install.python-poetry.org | POETRY_VERSION=2.1.2 POETRY_HOME=/opt/dive/poetry python -
ENV PATH="/opt/dive/poetry/bin:$PATH"
# Create a virtual environment for the installation
RUN python -m venv /opt/dive/local/venv
# Poetry needs this set to recognize it as ane existing environment
ENV VIRTUAL_ENV="/opt/dive/local/venv"
ENV PATH="/opt/dive/local/venv/bin:$PATH"

# Copy only the lock and project files to optimize cache
COPY server/pyproject.toml /opt/dive/src/
COPY .git/ /opt/dive/src/.git/
RUN poetry env use system
RUN poetry config virtualenvs.create false
# Install dependencies only
RUN poetry install --no-root
# Build girder client, including plugins like worker/jobs
# Copy full source code and install
COPY server/ /opt/dive/src/
RUN poetry install --only main
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
RUN . ~/.bashrc && \
    nvm install 14 && \
    nvm alias default 14 && \
    nvm use default && \
    ln -s $(dirname `which npm`) /usr/local/node

ENV PATH="/usr/local/node:$PATH"

RUN girder build

# =================
# == DIST SERVER ==
# =================
FROM python:3.11-slim-buster as server

RUN apt-get update
RUN apt-get install -y libgl1 libglib2.0-0

# Hack: Tell GitPython to be quiet, we aren't using git
ENV GIT_PYTHON_REFRESH="quiet"
ENV PATH="/opt/dive/local/venv/bin:$PATH"

# Copy site packages and executables
COPY --from=server-builder /opt/dive/local/venv /opt/dive/local/venv
# Copy the source code of the editable module
COPY --from=server-builder /opt/dive/src /opt/dive/src
# Copy the client code into the static source location
COPY --from=client-builder /app/dist/ /opt/dive/local/venv/share/girder/static/dive/
# Install startup scripts
COPY docker/entrypoint_server.sh docker/server_setup.py /

ENTRYPOINT [ "/entrypoint_server.sh" ]
