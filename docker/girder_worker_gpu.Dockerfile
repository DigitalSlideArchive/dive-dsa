# ========================
# == SERVER BUILD STAGE ==
# ========================

FROM nvidia/cuda:12.6.0-devel-ubuntu20.04 AS server-builder

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

# ----------------------------
# System Dependencies & Python 3.11
# ----------------------------
RUN apt-get update && apt-get install -y \
    software-properties-common \
    build-essential \
    libssl-dev \
    libffi-dev \
    libsm6 \
    libxext6 \
    libgl1 \
    curl \
    wget \
    git && \
    wget -O ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz && \
    mkdir /tmp/ffextracted && \
    tar -xvf ffmpeg.tar.xz -C /tmp/ffextracted --strip-components=1 && \
    add-apt-repository ppa:deadsnakes/ppa && \
    apt-get update && apt-get install -y \
    python3.11 \
    python3.11-venv \
    python3.11-dev \
    python3.11-tk && \
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1 && \
    curl -sS https://bootstrap.pypa.io/get-pip.py | python3.11 - && \
    ln -s /usr/bin/python3.11 /usr/bin/python && \
    apt-get clean && rm -rf /var/lib/apt/lists/* ffmpeg.tar.xz

# ----------------------------
# Working Directory & Entrypoint
# ----------------------------
WORKDIR /opt/dive/src
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini /tini
COPY docker/entrypoint_worker_gpu.sh /entrypoint_worker_gpu.sh
RUN chmod +x /tini /entrypoint_worker_gpu.sh

# ----------------------------
# Poetry Installation & Python venv
# ----------------------------
RUN curl -sSL https://install.python-poetry.org | POETRY_VERSION=2.1.2 POETRY_HOME=/opt/dive/poetry python3.11 -
ENV PATH="/opt/dive/poetry/bin:$PATH"

RUN python3.11 -m venv --copies /opt/dive/local/venv
ENV VIRTUAL_ENV="/opt/dive/local/venv"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

# ----------------------------
# Dependency Installation
# ----------------------------
COPY server/pyproject.toml /opt/dive/src/
COPY .git/ /opt/dive/src/.git/

RUN poetry env use system && \
    poetry config virtualenvs.create false && \
    poetry install --no-root

# ----------------------------
# Application Source Code
# ----------------------------
COPY server/ /opt/dive/src/

# Create user & assign permissions
RUN useradd --create-home --uid 1099 --shell=/bin/bash dive && \
    chown -R dive /opt/dive
RUN install -g dive -o dive -d /tmp/SAM2
USER dive

# Final install in user context
RUN poetry install --only main

# ----------------------------
# FFmpeg Binary into venv
# ----------------------------
RUN cp /tmp/ffextracted/ffmpeg /opt/dive/local/venv/bin/ffmpeg && \
    cp /tmp/ffextracted/ffprobe /opt/dive/local/venv/bin/ffprobe

# ----------------------------
# Entrypoint & CMD
# ----------------------------
ENTRYPOINT ["/tini", "--"]
CMD ["/entrypoint_worker_gpu.sh"]
