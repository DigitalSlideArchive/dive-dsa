# ========================
# == BUILD STAGE ==
# ========================
FROM nvidia/cuda:12.6.0-runtime-ubuntu20.04

# Environment Configuration
ENV NVIDIA_VISIBLE_DEVICES=${NVIDIA_VISIBLE_DEVICES:-all}
ENV NVIDIA_DRIVER_CAPABILITIES=${NVIDIA_DRIVER_CAPABILITIES:+$NVIDIA_DRIVER_CAPABILITIES,}graphics
ENV PATH=/usr/local/nvidia/bin:/usr/local/cuda/bin:$PATH
ENV CUDA_HOME="/usr/local/cuda"
ENV TORCH_CUDA_ARCH_LIST="6.0 6.1 7.0 7.5 8.0 8.6+PTX 8.9"
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
ENV TINI_VERSION=v0.19.0

# Install build dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        wget curl tar xz-utils ca-certificates \
        build-essential pkg-config \
        libgomp1 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# Download and extract ffmpeg
RUN wget -O ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz && \
    mkdir /tmp/ffextracted && \
    tar -xvf ffmpeg.tar.xz -C /tmp/ffextracted --strip-components=1 && \
    rm ffmpeg.tar.xz

WORKDIR /opt/dive/src

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/
ENV PATH="/usr/local:$PATH"

# Setup Python environment
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
ENV VIRTUAL_ENV="/opt/dive/local/venv"
ENV UV_PROJECT_ENVIRONMENT="/opt/dive/local/venv"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

WORKDIR /opt/dive/src

# Copy dependency files for better caching
COPY server/pyproject.toml server/uv.lock .git/ /opt/dive/src/

# Install dependencies with CUDA support
RUN uv sync --frozen --no-install-project --no-dev --extra cu128

# Copy source and install project
COPY server/ /opt/dive/src/
RUN uv sync --frozen --no-dev --extra cu128

# Copy ffmpeg binaries to venv
RUN cp /tmp/ffextracted/ffmpeg /tmp/ffextracted/ffprobe /opt/dive/local/venv/bin/


# Create user and directories
RUN useradd --create-home --uid 1099 --shell=/bin/bash dive && \
    chown -R dive /opt/dive
RUN install -g dive -o dive -d /tmp/SAM2
USER dive

# Setup environment
ENV PATH="/opt/dive/local/venv/bin:$PATH"

# Copy uv binary for runtime use

# Copy startup script
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
COPY docker/entrypoint_worker_gpu.sh /entrypoint_worker_gpu.sh
RUN chmod +x /tini /entrypoint_worker_gpu.sh

ENTRYPOINT ["/tini", "--"]
CMD ["/entrypoint_worker_gpu.sh"]
