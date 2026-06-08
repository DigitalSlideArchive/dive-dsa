# Upgrading to Girder 5

DIVE-DSA now runs on **Girder 5** with updated worker plugins, WebSocket notifications, and Docker Compose configuration. Use this page when upgrading an existing Girder 3 deployment or aligning a custom `.env` with the current stack.

For general deployment steps, see [Running with Docker Compose](Deployment-Docker-Compose.md). For upstream Girder API and plugin changes, see the [Girder migration guide](https://github.com/girder/girder/blob/v4-integration/docs/migration-guide.rst).

## Summary of infrastructure changes

| Change | Action required |
|--------|-----------------|
| **Girder 5** | Rebuild or pull `dive-dsa-web` and `dive-dsa-worker` images. |
| **Redis** | Add a Redis service; required for job and UI notifications. |
| **Notifications** | The web client uses WebSockets (not the legacy Girder EventStream) via `@girder/components` from `girder/girder_web_components#girder-5-websocket-upgrade`. Ensure browsers can reach the Girder API and that Redis is running. |
| **Environment variables** | Rename broker and worker API settings (table below). |
| **Static clients** | Girder UI is pre-built at `GIRDER_STATIC_ROOT_DIR` (`/opt/dive/clients/girder`) and served at `/girder`. The DIVE annotator is built separately and served at `/dive` with assets under `/dive/static`. The DIVE Girder plugin web client is built with Vite into `server/dive_server/web_client/dist`. |

## Environment variable renames

Update your `.env` (and any external orchestration) to use Girder 5 names:

| Girder 4 / legacy name | Girder 5 name | Purpose |
|------------------------|---------------|---------|
| `CELERY_BROKER_URL` | `GIRDER_WORKER_BROKER` | RabbitMQ URL for Celery (message broker). |
| `WORKER_API_URL` | `GIRDER_SETTING_WORKER_API_URL` | Girder REST API URL workers call (e.g. `http://girder:8080/api/v1`). |
| *(not used)* | `GIRDER_WORKER_BACKEND` | Celery result backend (Compose default: `rpc://guest:guest@localhost/`). |
| *(not used)* | `GIRDER_NOTIFICATION_REDIS_URL` | Redis URL for Girder notification fan-out (e.g. `redis://redis:6379`). |
| *(not used)* | `GIRDER_STATIC_ROOT_DIR` | Path to built Girder web client inside the container (set in Compose). |

`GIRDER_WORKER_BACKEND` is **not** a replacement for `WORKER_API_URL`. Do not point it at `http://…/api/v1`; use `GIRDER_SETTING_WORKER_API_URL` for that.

## Recommended upgrade steps

1. **Back up** MongoDB and any asset store data before upgrading.
2. **Checkout** the `girder-5-upgradge-2026` branch and copy `.env.Default` changes into your `.env`.
3. **Rename variables** in `.env` per the table above.
4. **Add Redis** — use the `redis` service from `docker-compose.yml` or an external Redis instance and set `GIRDER_NOTIFICATION_REDIS_URL` on `girder` and all worker services.
5. **Rebuild or pull** images, then restart the stack:

```bash
docker-compose -f docker-compose.yml build
docker-compose -f docker-compose.yml up -d
```

6. **Smoke-test** login, job launch, S3/assetstore imports, and job status updates in the UI (confirms WebSocket notifications and Redis).

## URL layout

| Path | Content |
|------|---------|
| `/girder` | Girder 5 web client (data browser, jobs, admin) |
| `/dive` | DIVE annotator SPA |
| `/dive/static/...` | DIVE annotator JS/CSS/assets |
| `/api/v1` | Girder REST API (unchanged) |

Production builds set `VUE_APP_STATIC_PATH=/dive/static` so the annotator resolves assets correctly under the `/dive` mount.

## Development: plugin web client

The Girder plugin UI under `server/dive_server/web_client/` must be built before Girder can register its static assets. Production images build this during `docker build`. In development, the `./server` bind mount hides image-built artifacts, so either:

- rebuild the web image after plugin changes, or
- build on the host:

```bash
cd server/dive_server/web_client && npm install && npm run build
```

On container start, the entrypoint also restores the image-built plugin dist from `/opt/dive/clients/dive-plugin-web-client` when the mounted `web_client/dist` directory is missing.

## Development-only: `localworker`

When using `docker-compose.override.yml`, a **`localworker`** service runs Celery on the `local` queue for assetstore import follow-up tasks. This service is for local development and assetstore import post-processing.

## Python dependencies

Server packages pin Girder 5 (`girder`, `girder_jobs`, `girder_worker`, etc. at 5.0.x in `server/pyproject.toml`). Regenerate the lockfile from `server/` if you change plugin versions:

```bash
cd server && uv lock
```
