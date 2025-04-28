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

if [[ "$DEVELOPMENT_MODE" == "True" ]]; then
  echo "Development mode is enabled, syncing client builds..."
  echo "Syncing Dive client..."
  cp -r /opt/dive/clients/dive/ /opt/dive/src/dive_server/dive_client/
  echo "Syncing Girder client..."
  cp -r /opt/dive/clients/girder/ /opt/dive/src/dive_server/web_client/dist/
fi


set -e
python /server_setup.py
exec girder serve --host 0.0.0.0 $@
