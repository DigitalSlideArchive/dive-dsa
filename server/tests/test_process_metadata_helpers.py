"""
Unit tests for ``process_metadata`` hardening: path parsing and config normalization.
"""

from __future__ import annotations

import json

import pytest

pytest.importorskip('girder')

from dive_server.views_metadata import (  # noqa: E402
    _PROCESS_METADATA_DISPLAY_DEFAULT,
    _PROCESS_METADATA_FFPROBE_DEFAULT,
    _normalize_metadata_config,
    remove_before_folder,
)


@pytest.mark.parametrize(
    'path',
    [None, False, True, 0, 1, [], {}],
)
def test_remove_before_folder_non_string_returns_none(path):
    assert remove_before_folder(path, 'anything') is None


def test_remove_before_folder_string_slice():
    assert remove_before_folder('/root/foo/bar', 'foo') == 'foo/bar'
    assert remove_before_folder('/no/match', 'zzz') is None


def test_normalize_metadata_config_none_uses_defaults():
    d = _normalize_metadata_config(None, _PROCESS_METADATA_DISPLAY_DEFAULT)
    assert isinstance(d, dict)
    assert d['display'] == _PROCESS_METADATA_DISPLAY_DEFAULT['display']
    d['categoricalLimit'] = 50
    assert d['categoricalLimit'] == 50


def test_normalize_metadata_config_json_string_merges_defaults():
    raw = json.dumps({'display': [], 'hide': []})
    d = _normalize_metadata_config(raw, _PROCESS_METADATA_DISPLAY_DEFAULT)
    assert d['display'] == []
    assert d['hide'] == []


def test_normalize_metadata_config_invalid_json_string_uses_defaults():
    d = _normalize_metadata_config('not valid json', _PROCESS_METADATA_DISPLAY_DEFAULT)
    assert d == dict(_PROCESS_METADATA_DISPLAY_DEFAULT)


def test_normalize_metadata_config_ffprobe_partial_merges_keys():
    d = _normalize_metadata_config(
        {'import': False},
        _PROCESS_METADATA_FFPROBE_DEFAULT,
    )
    assert d['import'] is False
    assert d['keys'] == _PROCESS_METADATA_FFPROBE_DEFAULT['keys']


def test_normalize_metadata_config_display_string_like_girder_form_body():
    """Girder may pass a jsonParam value as a JSON object string; normalize yields a mutable dict."""
    payload = json.dumps({'display': ['A'], 'hide': ['B']})
    display_config = _normalize_metadata_config(payload, _PROCESS_METADATA_DISPLAY_DEFAULT)
    display_config['categoricalLimit'] = 40
    assert display_config['categoricalLimit'] == 40
    assert display_config['display'] == ['A']
    assert display_config['hide'] == ['B']
