"""Girder model operations for Hugging Face style model repositories."""

from __future__ import annotations

import json
import mimetypes
import posixpath
import tempfile
from typing import Any, Dict, List, Optional
import zipfile

from girder.constants import AccessType
from girder.exceptions import RestException
from girder.models.collection import Collection
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.item import Item
from girder.models.setting import Setting
from girder.models.upload import Upload

from . import constants
from .paths import (
    MANIFEST_NAME,
    split_file_path,
    stripped_prefix,
    validate_repo_id,
    zip_member_paths,
)


def get_root_collection(create: bool = False, user=None) -> Optional[dict]:
    """
    The collection holding ``<org>/<repo>`` folders: the one named by the
    ``dive_hf_models.root_collection`` setting, else one called
    ``DIVE HF Models``. With ``create``, a public one is made and recorded.
    It is public so browsers can fetch model files for the system.
    """
    collection_id = Setting().get(constants.ROOT_COLLECTION_SETTING)
    if collection_id:
        collection = Collection().load(collection_id, force=True)
        if collection is not None:
            return collection
    collection = Collection().findOne({'name': constants.DEFAULT_COLLECTION_NAME})
    if collection is None and create:
        collection = Collection().createCollection(
            constants.DEFAULT_COLLECTION_NAME,
            creator=user,
            description=constants.DEFAULT_COLLECTION_DESCRIPTION,
            # Public on purpose: the Segment tool loads these files by URL.
            public=True,
            reuseExisting=True,
        )
    if collection is not None and create and not collection_id:
        Setting().set(constants.ROOT_COLLECTION_SETTING, str(collection['_id']))
    return collection


def _child_folder(parent: dict, parent_type: str, name: str) -> Optional[dict]:
    return Folder().findOne(
        {'parentId': parent['_id'], 'parentCollection': parent_type, 'name': name}
    )


def get_repo_folder(repo_id: str, user=None, level=AccessType.READ) -> Optional[dict]:
    """The folder for ``org/repo``, or None. Raises if it exists but is not readable."""
    org, repo = validate_repo_id(repo_id)
    root = get_root_collection()
    if root is None:
        return None
    org_folder = _child_folder(root, 'collection', org)
    if org_folder is None:
        return None
    folder = _child_folder(org_folder, 'folder', repo)
    if folder is not None:
        Folder().requireAccess(folder, user=user, level=level)
    return folder


def resolve_file(repo_id: str, path: str, user=None) -> dict:
    """The Girder file at ``path`` inside the ``repo_id`` folder, or a 404."""
    try:
        parts = split_file_path(path)
        folder = get_repo_folder(repo_id, user=user)
    except ValueError as err:
        raise RestException(str(err), code=404)
    not_found = RestException(f'File "{path}" not found in model "{repo_id}"', code=404)
    if folder is None:
        raise not_found
    for name in parts[:-1]:
        folder = _child_folder(folder, 'folder', name)
        if folder is None:
            raise not_found
        Folder().requireAccess(folder, user=user, level=AccessType.READ)
    item = Item().findOne({'folderId': folder['_id'], 'name': parts[-1]})
    if item is None:
        raise not_found
    files = list(Item().childFiles(item))
    match = next((f for f in files if f['name'] == parts[-1]), files[0] if files else None)
    if match is None:
        raise not_found
    return match


def list_repos(user=None) -> List[Dict[str, Any]]:
    """Every ``org/repo`` folder under the root collection that ``user`` can read."""
    root = get_root_collection()
    if root is None:
        return []
    repos = []
    for org_folder in Folder().childFolders(root, 'collection', user=user):
        for folder in Folder().childFolders(org_folder, 'folder', user=user):
            if folder['name'].endswith(constants.STAGING_SUFFIX):
                continue
            meta = folder.get('meta', {})
            repos.append(
                {
                    'repoId': f"{org_folder['name']}/{folder['name']}",
                    'folderId': str(folder['_id']),
                    'revision': meta.get(constants.META_REVISION),
                    'updated': folder.get('updated'),
                }
            )
    return repos


def _copy_to_temp(file: dict) -> Any:
    tmp = tempfile.NamedTemporaryFile(suffix='.zip')
    for chunk in File().download(file, headers=False)():
        tmp.write(chunk)
    tmp.flush()
    tmp.seek(0)
    return tmp


def _read_manifest(zf: zipfile.ZipFile, prefix: Optional[str]) -> Dict[str, Any]:
    wanted = f'{prefix}/{MANIFEST_NAME}' if prefix else MANIFEST_NAME
    for name in zf.namelist():
        if posixpath.normpath(name.replace('\\', '/')) == wanted:
            try:
                manifest = json.loads(zf.read(name).decode('utf-8'))
            except (UnicodeDecodeError, json.JSONDecodeError) as err:
                raise RestException(f'Invalid {MANIFEST_NAME}: {err}')
            if not isinstance(manifest, dict):
                raise RestException(f'Invalid {MANIFEST_NAME}: expected an object')
            return manifest
    return {}


def _mime_type(name: str) -> str:
    return mimetypes.guess_type(name)[0] or 'application/octet-stream'


def _iter_folders(parent: dict, parts: List[str], cache: dict, user) -> dict:
    folder = parent
    for i, name in enumerate(parts):
        key = tuple(parts[: i + 1])
        if key not in cache:
            cache[key] = Folder().createFolder(
                folder, name, parentType='folder', creator=user, reuseExisting=True
            )
        folder = cache[key]
    return folder


def import_zip(
    zip_file: dict,
    user,
    repo_id: Optional[str] = None,
    revision: Optional[str] = None,
    replace: bool = False,
) -> Dict[str, Any]:
    """
    Extract a model zip into ``<root collection>/<org>/<repo>/``.

    The zip holds the repository files (``config.json``, ``onnx/...``) at its
    root or under one or two wrapping directories. The repo id comes from
    ``repo_id``, else the ``dive_hf_model.json`` manifest, else a wrapping
    ``<org>/<repo>/`` directory. Files are extracted into a staging folder
    that replaces the existing repository only once everything is uploaded.
    """
    with _copy_to_temp(zip_file) as tmp:
        try:
            zf = zipfile.ZipFile(tmp)
        except zipfile.BadZipFile:
            raise RestException(f'"{zip_file["name"]}" is not a zip file')
        with zf:
            names = zf.namelist()
            prefix = stripped_prefix(names)
            manifest = _read_manifest(zf, prefix)
            if not repo_id:
                repo_id = manifest.get('repoId')
            if not repo_id and prefix and len(prefix.split('/')) == 2:
                repo_id = prefix
            if not repo_id:
                raise RestException(
                    'Could not determine the model id: pass repoId, include '
                    f'{MANIFEST_NAME}, or wrap the files in an <org>/<repo>/ directory'
                )
            try:
                org, repo = validate_repo_id(repo_id)
                members = zip_member_paths(names)
            except ValueError as err:
                raise RestException(str(err))
            if not any(rel == 'config.json' for _, rel in members):
                raise RestException('The zip has no config.json at the model root')
            revision = revision or manifest.get('revision') or 'main'

            root = get_root_collection(create=True, user=user)
            org_folder = Folder().createFolder(
                root, org, parentType='collection', creator=user, reuseExisting=True
            )
            existing = _child_folder(org_folder, 'folder', repo)
            if existing is not None and not replace:
                raise RestException(
                    f'Model "{repo_id}" already exists; import with replace=true to overwrite it'
                )
            leftover = _child_folder(org_folder, 'folder', repo + constants.STAGING_SUFFIX)
            if leftover is not None:
                Folder().remove(leftover)
            staging = Folder().createFolder(
                org_folder, repo + constants.STAGING_SUFFIX, parentType='folder', creator=user
            )
            try:
                cache: dict = {}
                for member, rel in members:
                    parts = rel.split('/')
                    parent = _iter_folders(staging, parts[:-1], cache, user)
                    size = zf.getinfo(member).file_size
                    with zf.open(member) as handle:
                        Upload().uploadFromFile(
                            handle,
                            size,
                            parts[-1],
                            parentType='folder',
                            parent=parent,
                            user=user,
                            mimeType=_mime_type(parts[-1]),
                        )
            except Exception:
                Folder().remove(staging)
                raise

    if existing is not None:
        Folder().remove(existing)
    staging['name'] = repo
    staging = Folder().updateFolder(staging)
    staging = Folder().setMetadata(
        staging,
        {
            constants.META_REPO_ID: repo_id,
            constants.META_REVISION: revision,
            constants.META_SOURCE: manifest.get('source'),
        },
    )
    return {
        'repoId': repo_id,
        'revision': revision,
        'folderId': str(staging['_id']),
        'files': [rel for _, rel in members],
        'replaced': existing is not None,
    }


def remove_source_zip(zip_file: dict) -> None:
    """Delete an imported zip: its item when the zip is the item's only file."""
    item = Item().load(zip_file['itemId'], force=True)
    if item is not None and len(list(Item().childFiles(item, limit=2))) <= 1:
        Item().remove(item)
    else:
        File().remove(zip_file)
