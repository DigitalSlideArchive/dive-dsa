#!/bin/bash
set -euo pipefail

echo "Installed dive_server package:"
python -c "import dive_server; from pathlib import Path; p=Path(dive_server.__file__).parent; print(p); print('  dive_client:', (p/'dive_client'/'index.html').is_file()); print('  plugin dist:', (p/'web_client'/'dist'/'girder-plugin-dive.umd.cjs').is_file())"

python /server_setup.py
exec girder serve --host 0.0.0.0 "$@"
