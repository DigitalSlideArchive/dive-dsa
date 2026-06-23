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

The `dive_server` wheel bundles the DIVE annotator SPA and the Girder plugin web client.
Build both frontends before creating a release wheel:

```bash
bash scripts/build_release_assets.sh
uv build
```

Publishing is automated via `.github/workflows/release-dive-server.yml` on GitHub
release (requires [PyPI trusted publishing](https://docs.pypi.org/trusted-publishers/) for this repository).

### Test wheel install in Docker

Build the wheel on the host, then use compose to install it like PyPI and run Girder 5:

```bash
bash test_deployment/prepare.sh
docker compose -f test_deployment/docker-compose.yml up --build
```

- Girder UI: http://localhost:8010/girder (login `admin` / `letmein`)
- DIVE SPA: http://localhost:8010/dive
- RabbitMQ management: http://localhost:15672 (guest / guest)

The stack includes RabbitMQ, a `localworker` (Girder `local` queue), and a
`worker` (DIVE `celery` queue). Both install the same pre-built
`server/dist/*.whl` as the web container.

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
