# ========================
# == SERVER BUILD STAGE ==
# ========================
# Note: server-builder stage will be the same in both dockerfiles
FROM python:3.11-bookworm AS server-builder

WORKDIR /opt/dive/src

# https://cryptography.io/en/latest/installation/#debian-ubuntu
RUN apt-get update
RUN apt-get install -y build-essential libssl-dev libffi-dev python3-dev cargo npm libgl1
# Recommended poetry install https://python-poetry.org/docs/master/#installation
RUN curl -sSL https://install.python-poetry.org | POETRY_VERSION=2.1.2 POETRY_HOME=/opt/dive/poetry python -
ENV PATH="/opt/dive/poetry/bin:$PATH"
# Create a virtual environment for the installation
RUN python -m venv --copies /opt/dive/local/venv
# Poetry needs this set to recognize it as ane existing environment
ENV VIRTUAL_ENV="/opt/dive/local/venv"
ENV PATH="/opt/dive/local/venv/bin:$PATH"
# Copy only the lock and project files to optimize cache
COPY server/pyproject.toml /opt/dive/src/
COPY .git/ /opt/dive/src/.git/
# Use the system installation
RUN poetry env use system
RUN poetry config virtualenvs.create false
# Install dependencies only
RUN poetry install --no-root
# Build girder client, including plugins like worker/jobs
# RUN girder build

# Copy full source code and install
COPY server/ /opt/dive/src/
RUN poetry install --only main

# ====================
# == FFMPEG FETCHER ==
# ====================
FROM python:3.11-bookworm AS ffmpeg-builder
RUN wget -O ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
RUN mkdir /tmp/ffextracted
RUN tar -xvf ffmpeg.tar.xz -C /tmp/ffextracted --strip-components 1

# =================
# == DIST WORKER ==
# =================
FROM python:3.11-bookworm AS worker
# VIAME install at /opt/noaa/viame/
# VIAME pipelines at /opt/noaa/viame/configs/pipelines/

RUN apt-get update
RUN apt-get install -y build-essential libssl-dev libffi-dev python3-dev cargo npm libgl1

# install tini init system
ENV TINI_VERSION=v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini
RUN useradd --create-home --uid 1099 --shell=/bin/bash dive
RUN install -g dive -o dive -d /tmp/SAM2

# Setup the path of the incoming python installation
ENV PATH="/opt/dive/local/venv/bin:$PATH"

# Copy the built python installation
COPY --chown=dive:dive --from=server-builder /opt/dive/local/venv/ /opt/dive/local/venv/
# Copy the source code of the editable module
COPY --chown=dive:dive --from=server-builder /opt/dive/src /opt/dive/src
# Copy ffmpeg
COPY --from=ffmpeg-builder /tmp/ffextracted/ffmpeg /tmp/ffextracted/ffprobe /opt/dive/local/venv/bin/
# Copy provision scripts
COPY --chown=dive:dive docker/entrypoint_worker.sh /

ENTRYPOINT ["/tini", "--"]
CMD ["/entrypoint_worker.sh"]
