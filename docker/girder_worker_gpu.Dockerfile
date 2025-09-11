# ========================
# == SERVER BUILD STAGE ==
# ========================

FROM nvidia/cuda:12.6.0-runtime-ubuntu20.04 AS server-builder

# ----------------------------
# Environment Configuration
# ----------------------------
ENV NVIDIA_VISIBLE_DEVICES=${NVIDIA_VISIBLE_DEVICES:-all}
ENV NVIDIA_DRIVER_CAPABILITIES=${NVIDIA_DRIVER_CAPABILITIES:+$NVIDIA_DRIVER_CAPABILITIES,}graphics
ENV PATH=/usr/local/nvidia/bin:/usr/local/cuda/bin:$PATH
ENV CUDA_HOME="/usr/local/cuda"
ENV TORCH_CUDA_ARCH_LIST="6.0 6.1 7.0 7.5 8.0 8.6+PTX 8.9"
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC
ENV TINI_VERSION=v0.19.0

RUN apt-get update && \
    apt-get install -y --no-install-recommends wget curl tar xz-utils ca-certificates && \
    rm -rf /var/lib/apt/lists/*

# ----------------------------
# System Dependencies & Python 3.11
# ----------------------------
RUN wget -O ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz && \
    mkdir /tmp/ffextracted && \
    tar -xvf ffmpeg.tar.xz -C /tmp/ffextracted --strip-components=1 && \
     rm -rf /var/lib/apt/lists/* ffmpeg.tar.xz

# ----------------------------
# Working Directory & Entrypoint
# ----------------------------
WORKDIR /opt/dive/src
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
COPY docker/entrypoint_worker_gpu.sh /entrypoint_worker_gpu.sh
RUN chmod +x /tini /entrypoint_worker_gpu.sh

# Create user & assign permissions
RUN useradd --create-home --uid 1099 --shell=/bin/bash dive && \
    chown -R dive:dive /opt/dive
RUN install -g dive -o dive -d /tmp/SAM2
USER dive

COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/
# Move into the PATH
RUN ls /usr/local
ENV PATH="/usr/local:$PATH"


# ----------------------------
# UV Installation & Python venv
# ----------------------------
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
ENV UV_PROJECT_ENVIRONMENT=/opt/dive/local/venv
ENV VIRTUAL_ENV="/opt/dive/local/venv"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# ----------------------------
# Dependency Installation
# ----------------------------
COPY server/pyproject.toml /opt/dive/src/
COPY server/uv.lock /opt/dive/src/
COPY .git/ /opt/dive/src/.git/

RUN uv sync --frozen --no-install-project --no-dev

# ----------------------------
# Application Source Code
# ----------------------------
COPY server/ /opt/dive/src/

# Final install in user context
RUN uv sync --frozen --no-dev



# ----------------------------
# FFmpeg Binary into venv
# ----------------------------
RUN cp /tmp/ffextracted/ffmpeg /opt/dive/local/venv/bin/ffmpeg && \
    cp /tmp/ffextracted/ffprobe /opt/dive/local/venv/bin/ffprobe

RUN useradd --create-home --uid 1099 --shell=/bin/bash dive && \
    chown -R dive /opt/dive
RUN install -g dive -o dive -d /tmp/SAM2
USER dive


# ----------------------------
# Entrypoint & CMD
# ----------------------------
ENTRYPOINT ["/tini", "--"]
CMD ["/entrypoint_worker_gpu.sh"]
