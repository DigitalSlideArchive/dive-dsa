#!/bin/bash

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

sync_plugin_web_client() {
  local src=/opt/dive/clients/dive-plugin-web-client
  local dest=/opt/dive/src/dive_server/web_client/dist
  if [ -d "$src" ] && [ ! -f "$dest/girder-plugin-dive.umd.cjs" ]; then
    echo "Syncing DIVE Girder plugin web client..."
    mkdir -p "$dest"
    cp -r "$src/." "$dest/"
  fi
}

if [ "$DEVELOPMENT_MODE" = "True" ]; then
  echo "Development mode is enabled, syncing client builds..."
  echo "Syncing Dive client..."
  rm -rf /opt/dive/src/dive_server/dive_client
  mkdir -p /opt/dive/src/dive_server/dive_client
  cp -r /opt/dive/clients/dive/. /opt/dive/src/dive_server/dive_client/
  sync_plugin_web_client
else
  sync_plugin_web_client
fi

set -e

cd /opt/dive/src

if [ -e /opt/dive/src/.venv ] || [ -L /opt/dive/src/.venv ]; then
    rm -rf /opt/dive/src/.venv
fi

if [ "$1" = "--dev" ]; then
    shift
    set -- --mode development "$@"
fi

uv run python /server_setup.py
exec uv run girder serve --host 0.0.0.0 $@
