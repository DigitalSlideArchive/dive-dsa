# Girder 5 package-install test stack

These compose files validate the **Python package** install path used by Girder 5
and DIVE (not the main source-bind development stack in the repo root). Use the
local-wheel stack to exercise a checkout build, or the PyPI stack to exercise a
published release install.

## Upstream Girder docs (SPA / web client)

How Girder 5 expects front-end SPAs to be built and served is documented in the
[Girder migration guide](https://github.com/girder/girder/blob/master/docs/migration-guide.rst):

- **[Plugin web clients](https://github.com/girder/girder/blob/master/docs/migration-guide.rst#front-end-build-system-changes)** — each plugin builds its own Vite bundle and registers it with `registerPluginStaticContent` (there is no `girder build`).
- **[Core Girder SPA on a non-root path](https://github.com/girder/girder/blob/master/docs/migration-guide.rst#dynamic-route-configuration-system-removed)** — build with `npx vite build --base=/girder/`, set `GIRDER_STATIC_ROOT_DIR` to that `dist/`, and remount the core app under `/girder` in the plugin `load()`.

DIVE follows those patterns: the annotator SPA is an additional mount at `/dive`; the Girder plugin UI uses `registerPluginStaticContent`; the core UI is remounted at `/girder` with `GIRDER_STATIC_ROOT_DIR`.

## What gets installed

There are two compose files:

| Stack | Compose file | `dive-dsa` source |
|-------|--------------|-------------------|
| Local wheel | `docker-compose.yml` | Built from this checkout inside Docker |
| Published PyPI | `docker-compose.pypi.yml` | `uv pip install dive-dsa==…` from PyPI |

### Local wheel (`docker-compose.yml`)

| Package | How |
|---------|-----|
| `girder==5.0.12` | `pip` / `uv pip` from PyPI |
| `dive-dsa` (imports `dive_server` / `dive_tasks`) | Wheel built in Docker with frontends embedded |
| Girder core web UI | Built from `girder/girder` at tag `v5.0.12` with `npx vite build --base=/girder/`, then `GIRDER_STATIC_ROOT_DIR` |

### Published PyPI (`docker-compose.pypi.yml`)

| Package | How |
|---------|-----|
| `girder==5.0.12` | `uv pip` from PyPI |
| `dive-dsa==0.0.1` (override with build-arg) | `uv pip` from PyPI (SPA + plugin UI already in the wheel) |
| Girder core web UI | Same git-tag Vite build as above (not on PyPI) |

## Where the DIVE SPA lives in the package

Before `uv build`, the Docker image (or `scripts/build_release_assets.sh`) places:

| Built artifact | Path inside package / wheel | Served at |
|----------------|-----------------------------|-----------|
| Annotator SPA (`client/` Vite build) | `dive_server/dive_client/` | `/dive` and `/dive/static` |
| Girder plugin UI (`web_client/` Vite build) | `dive_server/web_client/dist/` | Registered via `registerPluginStaticContent` |

Hatch includes these paths in the wheel (`server/pyproject.toml`). At runtime,
`dive_server.GirderPlugin` mounts `/dive` from `Path(__file__).parent / "dive_client"`.

## Run

### Local wheel (build `dive-dsa` from this repo)

```bash
docker compose -f test_deployment/docker-compose.yml up --build
```

- Girder UI: http://localhost:8010/girder (login `admin` / `letmein`)
- DIVE SPA: http://localhost:8010/dive
- RabbitMQ management: http://localhost:15672 (`guest` / `guest`)

### Published PyPI (install `girder` + `dive-dsa` from PyPI)

```bash
docker compose -f test_deployment/docker-compose.pypi.yml up --build
```

- Girder UI: http://localhost:8011/girder (login `admin` / `letmein`)
- DIVE SPA: http://localhost:8011/dive
- RabbitMQ management: http://localhost:15673 (`guest` / `guest`)

Pin a different published version:

```bash
docker compose -f test_deployment/docker-compose.pypi.yml build \
  --build-arg DIVE_DSA_VERSION=0.0.1 \
  --build-arg PYTHON_GIRDER=5.0.12 \
  --build-arg GIRDER_VERSION=v5.0.12
```

## Optional: build the wheel on the host

Useful if you already have Node/uv and want to inspect `server/dist/*.whl`:

```bash
bash test_deployment/prepare.sh          # → server/scripts/build_wheel.sh
# or, with the same flags as build_wheel.sh:
bash server/scripts/build_wheel.sh
bash server/scripts/build_wheel.sh --publish   # needs UV_PUBLISH_TOKEN
```

See `server/README.md` (PyPI release build) for full CLI and GitHub Actions
instructions. `docker-compose.yml` still builds the wheel inside Docker; host
wheels are for local inspection, publish, or CI artifact checks.
`docker-compose.pypi.yml` installs a published wheel from PyPI instead.
