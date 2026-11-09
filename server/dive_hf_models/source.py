"""Validation of the model source setting (no Girder imports, safe to unit test)."""

from __future__ import annotations

from typing import Any, Dict
from urllib.parse import urlparse

from .constants import DEFAULT_MODEL_SOURCE, MODEL_SOURCES


def normalize_model_source(value: Any) -> Dict[str, Any]:
    """
    Validate ``{'source': ..., 'customHost': ...}`` and return it normalized:
    unknown keys dropped, ``customHost`` kept only for ``custom`` and given a
    trailing slash. ``None`` means the default.
    """
    if value is None:
        return dict(DEFAULT_MODEL_SOURCE)
    if not isinstance(value, dict):
        raise ValueError('Model source must be an object')
    source = value.get('source', 'auto')
    if source not in MODEL_SOURCES:
        raise ValueError(f'Model source must be one of {", ".join(MODEL_SOURCES)}')
    custom_host = None
    if source == 'custom':
        custom_host = (value.get('customHost') or '').strip()
        parsed = urlparse(custom_host)
        if parsed.scheme not in ('http', 'https') or not parsed.netloc:
            raise ValueError('A custom model source needs an http(s) customHost URL')
        if not custom_host.endswith('/'):
            custom_host += '/'
    return {'source': source, 'customHost': custom_host}
