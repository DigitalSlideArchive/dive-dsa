"""Pure path helpers for dive_hf_models (no Girder imports, safe to unit test)."""

from __future__ import annotations

import posixpath
import re
from typing import Iterable, List, Optional, Sequence, Tuple

# Hugging Face style "<org>/<name>" repository id.
_REPO_PART = re.compile(r'^[A-Za-z0-9][A-Za-z0-9._-]*$')

# Name of the manifest the CLI writes at the root of a model zip.
MANIFEST_NAME = 'dive_hf_model.json'


def validate_repo_id(repo_id: str) -> Tuple[str, str]:
    """Split ``org/name`` and reject anything that is not a plain two part id."""
    parts = (repo_id or '').strip().split('/')
    if len(parts) != 2 or not all(_REPO_PART.match(p) for p in parts):
        raise ValueError(f'Invalid model repository id "{repo_id}", expected "<org>/<name>"')
    if any('..' in p for p in parts) or repo_id.endswith('.git'):
        raise ValueError(f'Invalid model repository id "{repo_id}"')
    return parts[0], parts[1]


def split_file_path(path: str) -> List[str]:
    """
    Split a repository-relative file path (``onnx/model.onnx``) into components,
    rejecting empty, ``.``/``..`` and absolute components.
    """
    if not path or path.startswith('/') or '\\' in path:
        raise ValueError(f'Invalid model file path "{path}"')
    parts = path.split('/')
    if any(p in ('', '.', '..') for p in parts):
        raise ValueError(f'Invalid model file path "{path}"')
    return parts


def collapse_resolve_path(path: Sequence[str]) -> Tuple[str, ...]:
    """
    Girder routes match a fixed number of path tokens, but a model file can be
    nested at any depth. Collapse ``org/repo/resolve/rev/a/b/c`` into
    ``(org, repo, 'resolve', rev, 'a/b/c')`` so a single route matches it.
    """
    path = tuple(path)
    if len(path) > 5 and path[2] == 'resolve':
        return path[:4] + ('/'.join(path[4:]),)
    return path


def zip_member_paths(names: Iterable[str]) -> List[Tuple[str, str]]:
    """
    Map zip member names to repository-relative file paths.

    Directory entries, macOS metadata and the DIVE manifest are dropped. While
    the archive has no files at its root and everything sits in one top-level
    directory (``sam2.1-hiera-tiny-ONNX/`` or ``onnx-community/sam2.../``), that
    directory is stripped, so zips made from a download folder work as-is.

    :returns: ``[(member_name, relative_path)]``
    """
    files = []
    for name in names:
        if name.endswith('/'):
            continue
        normalized = posixpath.normpath(name.replace('\\', '/'))
        parts = normalized.split('/')
        if '__MACOSX' in parts or parts[-1] == '.DS_Store':
            continue
        files.append((name, split_file_path(normalized)))

    while files and all(len(parts) > 1 for _, parts in files):
        tops = {parts[0] for _, parts in files}
        if len(tops) != 1:
            break
        files = [(name, parts[1:]) for name, parts in files]

    result = []
    for name, parts in files:
        rel = '/'.join(parts)
        if rel == MANIFEST_NAME:
            continue
        result.append((name, rel))
    return result


def stripped_prefix(names: Iterable[str]) -> Optional[str]:
    """
    The top-level directories :func:`zip_member_paths` strips, joined with
    ``/`` (e.g. ``onnx-community/sam2.1-hiera-tiny-ONNX``), or None.
    """
    files = [
        posixpath.normpath(n.replace('\\', '/')).split('/')
        for n in names
        if not n.endswith('/') and '__MACOSX' not in n
    ]
    prefix: List[str] = []
    while files and all(len(parts) > 1 for parts in files):
        tops = {parts[0] for parts in files}
        if len(tops) != 1:
            break
        prefix.append(tops.pop())
        files = [parts[1:] for parts in files]
    return '/'.join(prefix) if prefix else None
