#!/bin/bash

# Environment variables that may be supplied
# WORKER_CONCURRENCY: The number of concurrent jobs to run at once. If not supplied, the celery default is used.
# WORKER_WATCHING_QUEUES: The comma separated list of queues to take tasks from. If not supplied, the celery default of 'celery' is used.

QUEUE_ARGUMENT=
CONCURRENCY_ARGUMENT=

if [[ -z "$DSA_USER" ]]; then
  echo "Set the DSA_USER before starting (e.g, DSA_USER=\$$(id -u):\$$(id -g) <up command>"
  exit 1
fi
# add a user with the DSA_USER's id; this user is named ubuntu if it doesn't
# exist.
adduser --uid ${DSA_USER%%:*} --disabled-password --gecos "" ubuntu 2>/dev/null
# add a group with the DSA_USER's group id.
addgroup --gid ${DSA_USER#*:} $(id -ng ${DSA_USER#*:}) 2>/dev/null
# add the user to the user group.
adduser $(id -nu ${DSA_USER%%:*}) $(getent group ${DSA_USER#*:} | cut "-d:" -f1) 2>/dev/null
# add a group with the docker group id.
addgroup --gid $(stat -c "%g" /var/run/docker.sock) docker 2>/dev/null
# add the user to the docker group.
adduser $(id -nu ${DSA_USER%%:*}) $(getent group $(stat -c "%g" /var/run/docker.sock) | cut "-d:" -f1) 2>/dev/null
# Try to increase permissions for the docker socket; this helps this work on
# OSX where the users don't translate
chmod 777 /var/run/docker.sock 2>/dev/null || true
chmod 777 ${TMPDIR:-/tmp} || true

if [ -n "$WORKER_WATCHING_QUEUES" ]; then
    QUEUE_ARGUMENT="--queues $WORKER_WATCHING_QUEUES"
fi

if [ -n "$WORKER_CONCURRENCY" ]; then
    CONCURRENCY_ARGUMENT="--concurrency $WORKER_CONCURRENCY"
fi

su $(id -nu ${DSA_USER%%:*}) -c "GW_DIRECT_PATHS=true uv run python -m dive_tasks -l info --without-gossip --without-mingle $QUEUE_ARGUMENT $CONCURRENCY_ARGUMENT -Ofair --prefetch-multiplier=1"

# su $(id -nu ${DSA_USER%%:*}) -c "GW_DIRECT_PATHS=true python -m girder_worker $CONCURRENCY_ARGUMENT -Ofair --prefetch-multiplier=1"
# exec python \
#     -m dive_tasks \
#     -l info \
#     --without-gossip --without-mingle \
#     $QUEUE_ARGUMENT $CONCURRENCY_ARGUMENT
