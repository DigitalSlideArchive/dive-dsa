# Celery worker: install dive_server from a pre-built host wheel.
# Build the wheel on the host first (see test_deployment/prepare.sh).

FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS ffmpeg-builder
RUN apt-get update && \
    apt-get install -y --no-install-recommends wget tar xz-utils && \
    rm -rf /var/lib/apt/lists/*
RUN wget -q -O ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz && \
    mkdir /tmp/ffextracted && \
    tar -xf ffmpeg.tar.xz -C /tmp/ffextracted --strip-components 1

FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ca-certificates \
      libgomp1 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
COPY --from=ffmpeg-builder /tmp/ffextracted/ffmpeg /tmp/ffextracted/ffprobe /usr/local/bin/
RUN chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

ENV VIRTUAL_ENV=/opt/dive/venv
ENV PATH="/opt/dive/venv/bin:$PATH"
ENV GIT_PYTHON_REFRESH=quiet

RUN uv venv "${VIRTUAL_ENV}"

COPY server/dist/dive_server-*.whl /tmp/wheels/
RUN uv pip install /tmp/wheels/dive_server-*.whl && rm -rf /tmp/wheels

RUN python -c "import dive_tasks; print('dive_tasks wheel install OK')"
RUN ffmpeg -version && ffprobe -version

COPY test_deployment/entrypoint_worker.sh /entrypoint_worker.sh
RUN chmod +x /entrypoint_worker.sh

ENTRYPOINT ["/entrypoint_worker.sh"]
