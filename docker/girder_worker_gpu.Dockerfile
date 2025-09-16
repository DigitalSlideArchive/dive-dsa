
# ====================
# == FFMPEG FETCHER ==
# ====================
FROM ubuntu:22.04 AS ffmpeg-builder
RUN apt-get update && \
    apt-get install -y wget tar xz-utils && \
    rm -rf /var/lib/apt/lists/*
RUN wget -O ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
RUN mkdir /tmp/ffextracted
RUN tar -xvf ffmpeg.tar.xz -C /tmp/ffextracted --strip-components 1


# =================
# == DIST WORKER ==
# =================
FROM nvidia/cuda:12.8.1-cudnn-runtime-ubuntu24.04 AS server

# Install only runtime dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        adduser \
        passwd \
        gosu \
        libgomp1 \
        ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# Install tini init system
ENV TINI_VERSION=v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
RUN chmod +x /tini

# Create user and directories
RUN useradd --create-home --uid 1099 --shell=/bin/bash dive && \
    install -g dive -o dive -d /tmp/SAM2
# Setup environment
WORKDIR /opt/dive/src

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
RUN PATH="/usr/local/bin:$PATH"
# Copy the built python installation and source

# Copy ffmpeg binaries
COPY --from=ffmpeg-builder /tmp/ffextracted/ffmpeg /tmp/ffextracted/ffprobe /opt/dive/local/venv/bin/

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
ENV VIRTUAL_ENV="/opt/dive/local/venv"
ENV UV_PROJECT_ENVIRONMENT=/opt/dive/local/venv
ENV UV_VENV_CLEAR=1
ENV PATH="/opt/dive/local/venv/bin:$PATH"




# Copy startup script
RUN uv python install  3.11
RUN uv python pin 3.11
COPY server/pyproject.toml /opt/dive/src/
COPY server/uv.lock /opt/dive/src/
# Create virtual environment
RUN uv venv /opt/dive/local/venv
# Install dependencies with CUDA-enabled PyTorch
RUN uv sync --frozen --no-install-project --no-dev --extra cu128


# Copy source and install project
COPY server/ /opt/dive/src/
# Install dependencies with CUDA-enabled PyTorch
RUN uv sync --frozen --no-dev --extra cu128
COPY --chown=dive:dive docker/entrypoint_worker_gpu.sh /


ENTRYPOINT ["/tini", "--"]
CMD ["/entrypoint_worker_gpu.sh"]
