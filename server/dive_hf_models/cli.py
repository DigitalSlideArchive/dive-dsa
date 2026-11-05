#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "click>=8.1",
#   "requests>=2.28",
#   "girder-client>=3.2.8,<4",
# ]
# ///
"""
dive-hf-models: package Hugging Face model repositories as zips and import
them into DIVE-DSA's Girder, so the browser loads them from Girder.

    uv run cli.py download                    # SAM2 q4 models -> ./*.zip only
    uv run cli.py upload onnx-community__sam2.1-hiera-tiny-ONNX.zip
        [--api-url https://dive.example.org/api/v1] [--folder-id ID]
    uv run cli.py sync                        # download + upload
    uv run cli.py list

Girder auth: --api-key, else --token, else a login (--username/--password,
prompted when missing). --api-url defaults to http://localhost:8010/api/v1.
Self-contained uv script (PEP 723): ``uv run cli.py`` or ``./cli.py``; also
installed as ``dive-hf-models`` with the server.
"""

from __future__ import annotations

import fnmatch
import json
from pathlib import Path
import posixpath
import tempfile
from typing import Dict, Iterable, List, Optional, Sequence
import zipfile

import click
import requests

# Browser SAM2 models used by client/dive-common/use/segmentation/samModels.ts.
DEFAULT_REPOS = (
    'onnx-community/sam2.1-hiera-tiny-ONNX',
    'onnx-community/sam2.1-hiera-small-ONNX',
)
# The dtype SamOnnx.ts loads.
DEFAULT_DTYPES = ('q4',)
# transformers.js ONNX file suffixes: onnx/<name>_<dtype>.onnx[_data[_N]].
KNOWN_DTYPES = ('fp16', 'q4f16', 'q4', 'int8', 'uint8', 'bnb4', 'quantized')
# Non-ONNX files transformers.js reads (configs, tokenizers).
DEFAULT_INCLUDES = ('*.json', '*.txt', '*.model')
MANIFEST_NAME = 'dive_hf_model.json'
CHUNK = 8 * 1024 * 1024
# Module docstring with click's \b marker so the examples are not rewrapped.
CLI_HELP = (__doc__ or '').replace('\n\n    uv run', '\n\n\b\n    uv run', 1)


def onnx_dtype(path: str) -> Optional[str]:
    """Return the dtype of an ONNX weight file (``fp32`` for no suffix), or None for other files."""
    name = posixpath.basename(path)
    stem, sep, _ = name.partition('.onnx')
    if not sep:
        return None
    for dtype in KNOWN_DTYPES:
        if stem.endswith(f'_{dtype}'):
            return dtype
    return 'fp32'


def select_files(
    paths: Iterable[str],
    dtypes: Sequence[str] = DEFAULT_DTYPES,
    includes: Sequence[str] = (),
    all_files: bool = False,
) -> List[str]:
    """Repository files to package: configs plus ONNX weights of ``dtypes``."""
    selected = []
    for path in paths:
        if all_files:
            selected.append(path)
            continue
        if any(fnmatch.fnmatch(path, pattern) for pattern in includes):
            selected.append(path)
            continue
        dtype = onnx_dtype(path)
        if dtype is not None:
            if dtype in dtypes:
                selected.append(path)
        elif '/' not in path and any(fnmatch.fnmatch(path, p) for p in DEFAULT_INCLUDES):
            selected.append(path)
    return sorted(selected)


def zip_name(repo_id: str) -> str:
    return repo_id.replace('/', '__') + '.zip'


def _hf_headers(token: Optional[str]) -> Dict[str, str]:
    return {'Authorization': f'Bearer {token}'} if token else {}


def list_repo_files(
    endpoint: str, repo_id: str, revision: str, token: Optional[str]
) -> Dict[str, int]:
    """Map each file path in the repository to its size in bytes."""
    url: Optional[str] = (
        f'{endpoint.rstrip("/")}/api/models/{repo_id}/tree/{revision}?recursive=true'
    )
    files: Dict[str, int] = {}
    while url:
        resp = requests.get(url, headers=_hf_headers(token), timeout=60)
        resp.raise_for_status()
        for entry in resp.json():
            if entry.get('type') == 'file':
                files[entry['path']] = int(entry.get('size') or 0)
        url = resp.links.get('next', {}).get('url')
    return files


def build_zip(
    repo_id: str,
    out_path: Path,
    revision: str = 'main',
    dtypes: Sequence[str] = DEFAULT_DTYPES,
    includes: Sequence[str] = (),
    all_files: bool = False,
    endpoint: str = 'https://huggingface.co',
    token: Optional[str] = None,
) -> Path:
    """Download the selected files of ``repo_id`` straight into a zip with a manifest."""
    sizes = list_repo_files(endpoint, repo_id, revision, token)
    files = select_files(sizes, dtypes, includes, all_files)
    if 'config.json' not in files:
        raise click.ClickException(f'{repo_id}@{revision} has no config.json')
    total = sum(sizes[f] for f in files)
    click.echo(f'{repo_id}@{revision}: {len(files)} files, {total / 1e6:.1f} MB -> {out_path}')
    out_path.parent.mkdir(parents=True, exist_ok=True)
    partial = out_path.with_suffix(out_path.suffix + '.part')
    with zipfile.ZipFile(partial, 'w', zipfile.ZIP_STORED, allowZip64=True) as zf:
        for path in files:
            url = f'{endpoint.rstrip("/")}/{repo_id}/resolve/{revision}/{path}'
            with requests.get(url, headers=_hf_headers(token), stream=True, timeout=60) as resp:
                resp.raise_for_status()
                label = f'  {path}'
                with (
                    zf.open(path, 'w', force_zip64=True) as dest,
                    click.progressbar(length=max(sizes[path], 1), label=label) as bar,
                ):
                    for chunk in resp.iter_content(CHUNK):
                        dest.write(chunk)
                        bar.update(len(chunk))
        manifest = {
            'repoId': repo_id,
            'revision': revision,
            'source': f'{endpoint.rstrip("/")}/{repo_id}',
            'dtypes': list(dtypes),
            'files': files,
        }
        zf.writestr(MANIFEST_NAME, json.dumps(manifest, indent=2))
    partial.replace(out_path)
    return out_path


def zip_directory(directory: Path, out_path: Path, repo_id: Optional[str]) -> Path:
    """Zip a local model directory (e.g. from ``hf download``) for upload."""
    if not (directory / 'config.json').is_file():
        raise click.ClickException(f'{directory} has no config.json at its root')
    with zipfile.ZipFile(out_path, 'w', zipfile.ZIP_STORED, allowZip64=True) as zf:
        for path in sorted(directory.rglob('*')):
            rel = path.relative_to(directory).as_posix()
            if (
                path.is_file()
                and not rel.startswith(('.git/', '.cache/'))
                and rel != '.gitattributes'
            ):
                zf.write(path, rel)
        if repo_id and not (directory / MANIFEST_NAME).exists():
            zf.writestr(MANIFEST_NAME, json.dumps({'repoId': repo_id, 'revision': 'main'}))
    return out_path


def girder_client(
    api_url: str,
    api_key: Optional[str] = None,
    token: Optional[str] = None,
    username: Optional[str] = None,
    password: Optional[str] = None,
    login: bool = True,
):
    """
    Authenticate with an API key, else a token, else a Girder login: the
    username/password given, prompting for whichever is missing. With
    ``login=False`` and no key/token, stay anonymous.
    """
    import girder_client as gcm

    gc = gcm.GirderClient(apiUrl=api_url)
    try:
        if api_key:
            gc.authenticate(apiKey=api_key)
        elif token:
            gc.setToken(token)
        elif login or username:
            username = username or click.prompt('Girder username')
            password = password or click.prompt('Girder password', hide_input=True)
            gc.authenticate(username, password)
    except gcm.AuthenticationError as err:
        raise click.ClickException(
            f'Girder login failed: {str(err) or "check the username and password"}'
        )
    return gc


def require_admin(gc) -> None:
    """Fail before uploading anything: importing models needs a Girder admin."""
    me = gc.get('user/me')
    if not me:
        raise click.ClickException('Not logged in to Girder')
    if not me.get('admin'):
        raise click.ClickException(f'Girder user "{me["login"]}" is not an administrator')


def upload_zip(
    gc,
    zip_path: Path,
    repo_id: Optional[str] = None,
    replace: bool = False,
    folder_id: Optional[str] = None,
) -> dict:
    """Upload a model zip to Girder and extract it with ``POST dive_hf_models/import``."""
    if folder_id is None:
        me = gc.get('user/me')
        if not me:
            raise click.ClickException('Not logged in')
        private = list(gc.listFolder(me['_id'], 'user', name='Private'))
        if not private:
            raise click.ClickException('No Private folder for the zip; pass --folder-id')
        folder_id = private[0]['_id']
    click.echo(f'Uploading {zip_path} ({zip_path.stat().st_size / 1e6:.1f} MB)...')
    file = gc.uploadFileToFolder(folder_id, str(zip_path))
    click.echo('Extracting on the server...')
    params = {'fileId': file['_id'], 'replace': str(replace).lower(), 'deleteZip': 'true'}
    if repo_id:
        params['repoId'] = repo_id
    import girder_client as gcm

    try:
        result = gc.post('dive_hf_models/import', parameters=params)
    except gcm.HttpError as err:
        # The local zip is untouched; drop the uploaded copy.
        gc.delete(f'item/{file["itemId"]}')
        try:
            message = json.loads(err.responseText)['message']
        except (TypeError, ValueError, KeyError):
            message = err.responseText or str(err)
        raise click.ClickException(f'Import of {zip_path.name} failed: {message}')
    action = 'Replaced' if result.get('replaced') else 'Imported'
    click.echo(f'{action} {result["repoId"]}: {len(result["files"])} files')
    return result


def _resolve_url(api_url: str, repo_id: str) -> str:
    return f'{api_url.rstrip("/")}/dive_hf_models/{repo_id}/resolve/main/config.json'


download_options = [
    click.option('--revision', default='main', show_default=True, help='Hugging Face revision.'),
    click.option(
        '--dtype',
        'dtypes',
        multiple=True,
        default=DEFAULT_DTYPES,
        show_default=True,
        help=f'ONNX weights to include (fp32, {", ".join(KNOWN_DTYPES)}); repeatable.',
    ),
    click.option('--include', 'includes', multiple=True, help='Extra glob of files to include.'),
    click.option('--all', 'all_files', is_flag=True, help='Include every file in the repository.'),
    click.option(
        '--hf-endpoint',
        envvar='HF_ENDPOINT',
        default='https://huggingface.co',
        show_default=True,
    ),
    click.option('--hf-token', envvar='HF_TOKEN', help='Token for gated/private models.'),
]

girder_options = [
    click.option(
        '--api-url',
        envvar='GIRDER_API_URL',
        default='http://localhost:8010/api/v1',
        show_default=True,
        help='Girder REST API, e.g. https://host/api/v1.',
    ),
    click.option('--api-key', envvar='GIRDER_API_KEY', help='Girder API key (admin).'),
    click.option('--token', envvar='GIRDER_TOKEN', help='Girder token (admin).'),
    click.option(
        '--username', envvar='GIRDER_USERNAME', help='Girder login, used without a key/token.'
    ),
    click.option(
        '--password', envvar='GIRDER_PASSWORD', help='Girder password (prompted when missing).'
    ),
]


def _apply(options):
    def decorator(fn):
        for option in reversed(options):
            fn = option(fn)
        return fn

    return decorator


@click.group(help=CLI_HELP)
def cli():
    pass


@cli.command()
@click.argument('repo_ids', nargs=-1)
@_apply(download_options)
@click.option(
    '-o',
    '--out-dir',
    type=click.Path(file_okay=False, path_type=Path),
    default=Path('.'),
)
def download(repo_ids, revision, dtypes, includes, all_files, hf_endpoint, hf_token, out_dir):
    """Only download REPO_IDS (default: DIVE's SAM2 models) into <org>__<repo>.zip files."""
    for repo_id in repo_ids or DEFAULT_REPOS:
        build_zip(
            repo_id,
            out_dir / zip_name(repo_id),
            revision,
            dtypes,
            includes,
            all_files,
            hf_endpoint,
            hf_token,
        )


@cli.command()
@click.argument('paths', nargs=-1, required=True, type=click.Path(exists=True, path_type=Path))
@_apply(girder_options)
@click.option('--repo-id', help='<org>/<repo>; default: from the zip manifest or directory.')
@click.option('--replace', is_flag=True, help='Overwrite a model that is already in Girder.')
@click.option('--folder-id', help='Girder folder to upload the zip to (default: your Private).')
def upload(paths, api_url, api_key, token, username, password, repo_id, replace, folder_id):
    """Upload model zips (or model directories) and extract them in Girder."""
    if repo_id and len(paths) > 1:
        raise click.UsageError('--repo-id only works with a single path')
    gc = girder_client(api_url, api_key, token, username, password)
    require_admin(gc)
    for path in paths:
        if path.is_dir():
            with tempfile.TemporaryDirectory() as tmp:
                zipped = zip_directory(path, Path(tmp) / f'{path.name}.zip', repo_id)
                result = upload_zip(gc, zipped, repo_id, replace, folder_id)
        else:
            result = upload_zip(gc, path, repo_id, replace, folder_id)
        click.echo(f'  {_resolve_url(api_url, result["repoId"])}')


@cli.command()
@click.argument('repo_ids', nargs=-1)
@_apply(download_options)
@_apply(girder_options)
@click.option('--replace', is_flag=True, help='Overwrite models that are already in Girder.')
@click.option('--folder-id', help='Girder folder to upload the zip to (default: your Private).')
def sync(
    repo_ids,
    revision,
    dtypes,
    includes,
    all_files,
    hf_endpoint,
    hf_token,
    api_url,
    api_key,
    token,
    username,
    password,
    replace,
    folder_id,
):
    """Download REPO_IDS (default: DIVE's SAM2 models) and import them into Girder."""
    gc = girder_client(api_url, api_key, token, username, password)
    require_admin(gc)
    with tempfile.TemporaryDirectory() as tmp:
        for repo_id in repo_ids or DEFAULT_REPOS:
            path = build_zip(
                repo_id,
                Path(tmp) / zip_name(repo_id),
                revision,
                dtypes,
                includes,
                all_files,
                hf_endpoint,
                hf_token,
            )
            upload_zip(gc, path, None, replace, folder_id)
            path.unlink()
            click.echo(f'  {_resolve_url(api_url, repo_id)}')


@cli.command(name='list')
@_apply(girder_options)
def list_models(api_url, api_key, token, username, password):
    """List the models in Girder (anonymous unless credentials are given)."""
    gc = girder_client(api_url, api_key, token, username, password, login=False)
    for repo in gc.get('dive_hf_models/repos'):
        click.echo(f'{repo["repoId"]}  (folder {repo["folderId"]})')


if __name__ == '__main__':
    cli()
