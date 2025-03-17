FROM python:3.11-alpine as ffmpeg-builder
RUN wget -O ffmpeg.tar.xz https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
RUN mkdir /tmp/ffextracted
RUN tar -xvf ffmpeg.tar.xz -C /tmp/ffextracted --strip-components 1
# Use a version of alpine that includes bash and python
FROM python:3.11-slim
LABEL maintainer="Kitware, Inc. <kitware@kitware.com>"

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

RUN pip install --no-cache-dir --upgrade pip setuptools && \
    # Install bokeh to help debug dask \
    pip install --no-cache-dir 'bokeh>=0.12.14,<3' && \
    # Install girder-client \
    pip install --no-cache-dir girder-client && \
    # Install some other dependencies here to save time in the histomicstk \
    # install step \
    pip install --no-cache-dir opencv-python-headless && \
    # clean up \
    rm -rf /root/.cache/pip/*


RUN pip install girder-slicer-cli-web
RUN pip install girder-client
COPY . $PWD
COPY --from=ffmpeg-builder /tmp/ffextracted/ffmpeg /tmp/ffextracted/ffprobe /usr/local/bin/

ENTRYPOINT ["python", "cli_list.py"]
