FROM python:3.11-alpine as ffmpeg-builder
RUN wget -O ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
RUN mkdir /tmp/ffextracted
RUN tar -xvf ffmpeg.tar.xz -C /tmp/ffextracted --strip-components 1
# Use a version of alpine that includes bash and python
FROM python:3.11-slim
LABEL maintainer="Kitware, Inc. <kitware@kitware.com>"
LABEL com.nvidia.volumes.needed=nvidia_driver
RUN apt-get update && \
    apt-get install --yes --no-install-recommends \
    # For installing pip \
    curl \
    ca-certificates \
    # For versioning \
    git \
    # for convenience \
    wget \
    # Needed for building \
    build-essential \
    # can speed up large_image caching \
    memcached \
    && \
    # Clean up to reduce docker size \
    apt-get autoremove && \
    rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN mkdir -p /opt/SAM2/models /opt/SAM3/models

COPY ./download_ckpts.sh /opt/SAM2/models/download_ckpts.sh
COPY ./download_sam3_ckpts.sh /opt/SAM3/models/download_sam3_ckpts.sh
# Download the checkpoints
# and make sure the script is executable \
# and run it to download the checkpoints \
# and then remove the script to reduce image size \
RUN chmod u+x /opt/SAM2/models/download_ckpts.sh /opt/SAM3/models/download_sam3_ckpts.sh
RUN /opt/SAM2/models/download_ckpts.sh

RUN pip install --no-cache-dir --upgrade pip setuptools && \
    pip install --no-cache-dir huggingface_hub

# HF_TOKEN is passed at build time (e.g. from compose .env); not stored in the image ENV.
ARG HF_TOKEN=
RUN HF_TOKEN="${HF_TOKEN}" /opt/SAM3/models/download_sam3_ckpts.sh

RUN rm /opt/SAM2/models/download_ckpts.sh /opt/SAM3/models/download_sam3_ckpts.sh

RUN \
    # Install bokeh to help debug dask \
    pip install --no-cache-dir 'bokeh>=0.12.14,<3' && \
    # Install some other dependencies here to save time in the histomicstk \
    # install step \
    pip install --no-cache-dir opencv-python-headless && \
    # SAM dependencies
    pip install --no-cache-dir sam2 'sam3 @ git+https://github.com/facebookresearch/sam3.git' huggingface_hub psutil pycocotools torch pillow einops && \
    # clean up \
    rm -rf /root/.cache/pip/*


RUN pip install girder-slicer-cli-web
RUN pip install girder-client
COPY . $PWD
COPY --from=ffmpeg-builder /tmp/ffextracted/ffmpeg /tmp/ffextracted/ffprobe /usr/local/bin/

ENTRYPOINT ["python", "cli_list.py"]
