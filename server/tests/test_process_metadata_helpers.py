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
    _accumulate_flat_metadata_key_stats,
    _finalize_metadata_keys_categories,
    _is_blank_metadata_value_for_stats,
    _merge_recomputed_metadata_key_stats_into_existing,
    _metadata_dict_for_schema_stats_refresh,
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


def test_metadata_dict_for_schema_stats_refresh_strips_dive_prefixed_keys():
    meta = {'stricture_flag': 'Y', 'DIVE_Name': 'a', 'ffprobe_width': 1920}
    stripped = _metadata_dict_for_schema_stats_refresh(meta)
    assert stripped == {'stricture_flag': 'Y'}


def test_is_blank_metadata_value_for_stats():
    assert _is_blank_metadata_value_for_stats(None) is True
    assert _is_blank_metadata_value_for_stats('') is True
    assert _is_blank_metadata_value_for_stats('   \t') is True
    assert _is_blank_metadata_value_for_stats([]) is True
    assert _is_blank_metadata_value_for_stats(['', '  ']) is True
    assert _is_blank_metadata_value_for_stats('x') is False
    assert _is_blank_metadata_value_for_stats(0) is False
    assert _is_blank_metadata_value_for_stats(False) is False
    assert _is_blank_metadata_value_for_stats([1, 2]) is False
    assert _is_blank_metadata_value_for_stats(['', 'a']) is False


def test_accumulate_metadata_key_stats_skips_blank_strings_for_count():
    accum = {}
    for meta in (
        {'k': ''},
        {'k': '  '},
        {'k': 'Y'},
        {'k': None},
        {'k': 'Y'},
    ):
        _accumulate_flat_metadata_key_stats(accum, meta)
    _finalize_metadata_keys_categories(accum, categorical_limit=50)
    assert accum['k']['count'] == 2
    assert accum['k']['unique'] == 1


def test_merge_recomputed_metadata_key_stats_matches_process_metadata_shape():
    """After bulk refresh, categorical keys should carry count / type / unique like process_metadata."""
    accum = {}
    for meta in (
        {'stricture_flag': 'Y'},
        {'stricture_flag': 'N'},
        {'stricture_flag': 'Y'},
    ):
        _accumulate_flat_metadata_key_stats(accum, meta)
    _finalize_metadata_keys_categories(accum, categorical_limit=50)
    existing = {
        'LastModifiedTime': {'category': 'search', 'set': []},
        'stricture_flag': {
            'category': 'categorical',
            'count': 0,
            'set': ['Y'],
        },
        'note': {'category': 'categorical', 'count': 3, 'set': ['x'], 'description': '  kept  '},
    }
    merged = _merge_recomputed_metadata_key_stats_into_existing(existing, accum)
    assert merged['LastModifiedTime'] == existing['LastModifiedTime']
    assert merged['stricture_flag']['count'] == 3
    assert merged['stricture_flag']['type'] == 'string'
    assert merged['stricture_flag']['unique'] == 2
    assert set(merged['stricture_flag']['set']) == {'Y', 'N'}
    assert merged['note']['count'] == 0
    assert merged['note']['set'] == []
    assert merged['note']['unique'] == 0
    assert merged['note']['description'] == 'kept'
