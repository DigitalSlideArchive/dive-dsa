#!/bin/bash
set -euo pipefail

QUEUE_ARGUMENT=""
CONCURRENCY_ARGUMENT=""

if [ -n "${WORKER_WATCHING_QUEUES:-}" ]; then
    QUEUE_ARGUMENT="--queues ${WORKER_WATCHING_QUEUES}"
fi

if [ -n "${WORKER_CONCURRENCY:-}" ]; then
    CONCURRENCY_ARGUMENT="--concurrency ${WORKER_CONCURRENCY}"
fi

exec env GW_DIRECT_PATHS=true C_FORCE_ROOT=1 \
    python -m dive_tasks \
    -l info \
    --without-gossip --without-mingle \
    ${QUEUE_ARGUMENT} ${CONCURRENCY_ARGUMENT} \
    -Ofair --prefetch-multiplier=1
