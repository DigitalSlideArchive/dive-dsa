# Girder 5 package-install test stack

This compose file validates the **Python package** install path used by Girder 5
and DIVE (not the main source-bind development stack in the repo root).

## Upstream Girder docs (SPA / web client)

How Girder 5 expects front-end SPAs to be built and served is documented in the
[Girder migration guide](https://github.com/girder/girder/blob/master/docs/migration-guide.rst):

- **[Plugin web clients](https://github.com/girder/girder/blob/master/docs/migration-guide.rst#front-end-build-system-changes)** — each plugin builds its own Vite bundle and registers it with `registerPluginStaticContent` (there is no `girder build`).
- **[Core Girder SPA on a non-root path](https://github.com/girder/girder/blob/master/docs/migration-guide.rst#dynamic-route-configuration-system-removed)** — build with `npx vite build --base=/girder/`, set `GIRDER_STATIC_ROOT_DIR` to that `dist/`, and remount the core app under `/girder` in the plugin `load()`.

DIVE follows those patterns: the annotator SPA is an additional mount at `/dive`; the Girder plugin UI uses `registerPluginStaticContent`; the core UI is remounted at `/girder` with `GIRDER_STATIC_ROOT_DIR`.

## What gets installed

| Package | How |
|---------|-----|
| `girder==5.0.12` | `pip` / `uv pip` from PyPI |
| `dive_server` (includes `dive_tasks`) | Wheel built in Docker with frontends embedded |
| Girder core web UI | Built from `girder/girder` at tag `v5.0.12` with `npx vite build --base=/girder/`, then `GIRDER_STATIC_ROOT_DIR` |

## Where the DIVE SPA lives in the package

Before `uv build`, the Docker image (or `scripts/build_release_assets.sh`) places:

| Built artifact | Path inside package / wheel | Served at |
|----------------|-----------------------------|-----------|
| Annotator SPA (`client/` Vite build) | `dive_server/dive_client/` | `/dive` and `/dive/static` |
| Girder plugin UI (`web_client/` Vite build) | `dive_server/web_client/dist/` | Registered via `registerPluginStaticContent` |

Hatch includes these paths in the wheel (`server/pyproject.toml`). At runtime,
`dive_server.GirderPlugin` mounts `/dive` from `Path(__file__).parent / "dive_client"`.

## Run

```bash
docker compose -f test_deployment/docker-compose.yml up --build
```

- Girder UI: http://localhost:8010/girder (login `admin` / `letmein`)
- DIVE SPA: http://localhost:8010/dive
- RabbitMQ management: http://localhost:15672 (`guest` / `guest`)

## Optional: build the wheel on the host

Useful if you already have Node/uv and want to inspect `server/dist/*.whl`:

```bash
bash test_deployment/prepare.sh   # runs build_release_assets.sh + uv build
```

The compose file above still builds the wheel inside Docker; host wheels are
for local inspection or CI artifact checks.
