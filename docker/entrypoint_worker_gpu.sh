#!/bin/bash
set -euo pipefail

# Environment variables that may be supplied:
# WORKER_CONCURRENCY: The number of concurrent jobs to run at once. If not supplied, celery default is used.
# WORKER_WATCHING_QUEUES: The comma-separated list of queues to take tasks from. If not supplied, default 'celery' is used.

QUEUE_ARGUMENT=""
CONCURRENCY_ARGUMENT=""

if [[ -z "${DSA_USER:-}" ]]; then
  echo "Set the DSA_USER before starting (e.g., DSA_USER=\$$(id -u):\$$(id -g) <up command>)"
  exit 1
fi

USER_ID=${DSA_USER%%:*}
GROUP_ID=${DSA_USER#*:}

# Ensure group exists
if ! getent group "${GROUP_ID}" >/dev/null 2>&1; then
  groupadd -g "${GROUP_ID}" dsa_group
fi

# Ensure user exists
if ! id -u "${USER_ID}" >/dev/null 2>&1; then
  useradd -m -u "${USER_ID}" -g "${GROUP_ID}" -s /bin/bash ubuntu2 || true
fi

# Handle docker.sock if present
if [[ -S /var/run/docker.sock ]]; then
  DOCKER_GID=$(stat -c "%g" /var/run/docker.sock)
  if ! getent group "${DOCKER_GID}" >/dev/null 2>&1; then
    groupadd -g "${DOCKER_GID}" docker
  fi
  usermod -aG "${DOCKER_GID}" "$(id -nu ${USER_ID})" || true
  chmod 777 /var/run/docker.sock || true
fi

# Ensure tmp is writable
chmod 1777 "${TMPDIR:-/tmp}" || true

# Worker arguments
if [[ -n "${WORKER_WATCHING_QUEUES:-}" ]]; then
    QUEUE_ARGUMENT="--queues $WORKER_WATCHING_QUEUES"
fi

if [[ -n "${WORKER_CONCURRENCY:-}" ]]; then
    CONCURRENCY_ARGUMENT="--concurrency $WORKER_CONCURRENCY"
fi

# Sanity checks for required tools
command -v uv >/dev/null 2>&1 || { echo "Error: 'uv' not found in PATH"; exit 1; }
command -v python >/dev/null 2>&1 || { echo "Error: 'python' not found in PATH"; exit 1; }

su $(id -nu ${DSA_USER%%:*}) -c "GW_DIRECT_PATHS=true uv run python -m dive_tasks -l info --without-gossip --without-mingle $QUEUE_ARGUMENT $CONCURRENCY_ARGUMENT -Ofair --prefetch-multiplier=1"
