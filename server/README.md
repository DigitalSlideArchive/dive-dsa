# DIVE Python Packages

There are several important python packages in this application

* `dive_server` is a collection of girder plugins for the web server
* `dive_tasks` is a collection of girder worker plugins for the celery worker
* `scripts` has general command-line utilities
* `dive_utils` is shared code between the above packages

## Prerequisites

Set up your system as described in the [Basic Deployment](https://kitware.github.io/dive/Deployment-Docker-Compose/)

## Development

In development, the server and client are run in separate processes.  In production, the client is built and bundled as static files into the server image.

This python project uses [uv](https://astral.sh/uv) for dependency management.

```bash
# Optional, for intellisense or whatever.  Not required for docker-compose
uv sync
```

### Running in development with docker

```bash
# Copy .env.default and make any changes
cp .env.default .env

# Option 1) Build the project from source
docker-compose build
# Option 2) Pull pre-build images
docker-compose pull

# Start the project
docker-compose up -d

# The web server has hot reload, so code changes will
# immediately trigger a server restart.

# The Celery workers do not have hot reload.
# To test code changes, a restart is needed
docker-compose up girder_worker_default
# or
docker-compose up girder_worker_pipelines
# or
docker-compose up girder_worker_training
```

Access the server at <http://localhost:8010>

To work on the Vue client, see development instructions in `../client`.

## PyPI release build

The **`dive-dsa`** distribution (PyPI name) bundles the DIVE annotator SPA and the
Girder plugin web client. Import packages remain `dive_server`, `dive_tasks`, and
`dive_utils`. Use one script for local build, verify, and optional publish.

### Prerequisites

- Node.js 20+ (24 recommended) and npm
- [uv](https://docs.astral.sh/uv/)
- Git history in the checkout (version comes from `uv-dynamic-versioning`)

### Local build

From the repository root:

```bash
bash server/scripts/build_wheel.sh
```

This stages frontends (`scripts/build_release_assets.sh`), runs `uv build`, and
checks that the wheel contains `dive_client` and the plugin UI. The wheel lands
in `server/dist/dive_dsa-*.whl` (hyphens in the PyPI name become underscores in
the wheel filename).

Useful flags:

```bash
# Reuse already-built dive_client/ and web_client/dist/
bash server/scripts/build_wheel.sh --skip-assets

# Build + verify only; do not upload (even with --publish)
bash server/scripts/build_wheel.sh --publish --dry-run
```

Equivalent from `test_deployment/`:

```bash
bash test_deployment/prepare.sh
```

### Local publish

PyPI rejects [local versions](https://packaging.python.org/en/latest/specifications/version-specifiers/#local-version-identifiers)
(`1.0.0.postN.dev0+gHASH`). Those are produced when the checkout is **not**
exactly on a version tag. Either tag a release:

```bash
git tag v1.2.3
git push origin v1.2.3
export UV_PUBLISH_TOKEN=pypi-...
bash server/scripts/build_wheel.sh --publish
```

or force a clean version without tagging (uses
`UV_DYNAMIC_VERSIONING_BYPASS`):

```bash
export UV_PUBLISH_TOKEN=pypi-...
bash server/scripts/build_wheel.sh --version 1.2.3 --publish
# also accepts: --version v1.2.3
```

`build_wheel.sh --publish` clears `server/dist/`, rebuilds, refuses versions
containing `+...`, and uploads only the new wheel + sdist.

`UV_PUBLISH_TOKEN` is the preferred auth for `uv publish`. Alternatively set
`UV_PUBLISH_USERNAME=__token__` and `UV_PUBLISH_PASSWORD` to the same token.
See [uv packaging docs](https://docs.astral.sh/uv/guides/package/#publishing-your-package).

### GitHub Actions publish

Publishing is automated via `.github/workflows/release-dive-server.yml` on
GitHub Release (or workflow_dispatch). CI uses
[PyPI trusted publishing](https://docs.pypi.org/trusted-publishers/) (OIDC) —
no `UV_PUBLISH_TOKEN` secret required. Pull requests also run a wheel build
smoke job in `.github/workflows/CI.yml` and upload the wheel as an artifact.

### Test wheel install in Docker (Girder 5 package path)

The `test_deployment/` stack installs **Girder from PyPI** and **DIVE from a
wheel** (SPA + plugin UI bundled into the package), matching Girder 5's
Python-package install model. The wheel is built inside Docker — no host
`npm`/`uv build` required:

```bash
docker compose -f test_deployment/docker-compose.yml up --build
```

See `test_deployment/README.md` for SPA placement details and optional host
wheel builds (`bash test_deployment/prepare.sh` → `server/scripts/build_wheel.sh`).

- Girder UI: http://localhost:8010/girder (login `admin` / `letmein`)
- DIVE SPA: http://localhost:8010/dive
- RabbitMQ management: http://localhost:15672 (guest / guest)

The stack includes RabbitMQ, a `localworker` (Girder `local` queue), and a
`worker` (DIVE `celery` queue).

## Unit Testing and Static Checks

Automation is done with [Tox](https://pypi.org/project/tox/) with tox-uv plugin.

```bash
# run only lint checks
uv run tox -e lint

# run only type checks
uv run tox -e type

# run only unit tests
uv run tox -e testunit

# run only a particular test
uv run tox -e testunit -- -k test_image_sort

# run all tests
uv run tox

# automatically format all code to comply to linting checks
uv run tox -e format

# run mkdocs and serve the documentation page
uv run tox -e docs

# creates docs in the /site folder for eventual deployment
uv run tox -e builddocs
```

## Debug utils and command line tools

``` bash
# Requires a local uv installation
uv sync

# show options
uv run dive --help

# build the standalone executable into ./dist
uv run tox -e buildcli
```

## Metadata properties

This section explains the metadata properties used to record application state in Girder.  These properties can be modified through the Girder UI editor.

### Dataset

Image chips that compose a video are stored as girder items in a folder.  Videos are stored as a single item in its own folder.  The parent folder must have the following metadata.

* `annotate` (boolean) marks a folder as a valid DIVE dataset
* `type` (`'video' | 'image-sequence'`) dataset type
* `fps` (number) annotation framerate, not to be confused with video raw framerate
* `ffprobe_info` (JSON) output of ffprobe for raw input video
* `confidenceFilters` (JSON) map of filter name to float in [0, 1]
* `customTypeStyline` (JSON) map of class name to GeoJS display attributes.
* `foreign_media_id` (string) For "cloned" datasets, this is an objectId pointer to the source media

### Video Item

* `codec` (string) video codec
* `source_video` (boolean) whether the video is a raw user upload or a trancoded video
