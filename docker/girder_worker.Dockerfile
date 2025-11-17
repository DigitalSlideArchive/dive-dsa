# ========================
# == SERVER BUILD STAGE ==
# ========================
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS server-builder
SHELL ["/bin/bash", "-c"]

WORKDIR /opt/dive/src

# Install build dependencies
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

# Copy dependency files first for better caching
COPY server/pyproject.toml /opt/dive/src/
COPY server/uv.lock /opt/dive/src/

# Install dependencies with CPU-only PyTorch for smaller size
RUN uv sync --frozen --no-install-project --no-dev --extra cpu

# Copy source and install project
COPY server/ /opt/dive/src/
RUN uv sync --frozen --no-dev --extra cpu


# ====================
# == FFMPEG FETCHER ==
# ====================
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS ffmpeg-builder
RUN apt-get update
RUN apt-get install -y wget tar xz-utils
RUN wget -O ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
RUN mkdir /tmp/ffextracted
RUN tar -xvf ffmpeg.tar.xz -C /tmp/ffextracted --strip-components 1

# =================
# == DIST WORKER ==
# =================
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim AS server

# Install only runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        libgomp1 \
        ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Install tini init system
ENV TINI_VERSION=v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

# Create user and directories
RUN useradd --create-home --uid 1099 --shell=/bin/bash dive && \
    install -g dive -o dive -d /tmp/SAM2

# Setup environment
ENV PATH="/opt/dive/local/venv/bin:$PATH"

# Copy the built python installation and source
COPY --chown=dive:dive --from=server-builder /opt/dive/local/venv/ /opt/dive/local/venv/
COPY --chown=dive:dive --from=server-builder /opt/dive/src /opt/dive/src

# Copy ffmpeg binaries
COPY --from=ffmpeg-builder /tmp/ffextracted/ffmpeg /tmp/ffextracted/ffprobe /opt/dive/local/venv/bin/

# Copy uv binary for runtime use
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Copy startup script
COPY --chown=dive:dive docker/entrypoint_worker.sh /

ENTRYPOINT ["/tini", "--"]
CMD ["/entrypoint_worker.sh"]
