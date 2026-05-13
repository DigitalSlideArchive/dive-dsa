"""Unit tests for dive_utils.metadata.numeric."""

from __future__ import annotations

import json
import math

import pytest

from dive_utils.metadata import numeric as n


def test_as_json_finite_float():
    assert n.as_json_finite_float(3.25) == 3.25
    assert n.as_json_finite_float(1) == 1.0
    assert n.as_json_finite_float(None, default=-1.0) == -1.0
    assert n.as_json_finite_float('bad', default=2.0) == 2.0
    assert n.as_json_finite_float(float('nan')) == 0.0
    assert n.as_json_finite_float(float('inf')) == 0.0
    assert n.as_json_finite_float(True, default=0.0) == 0.0


def test_as_finite_float_or_none():
    assert n.as_finite_float_or_none(3) == 3.0
    assert n.as_finite_float_or_none(3.5) == 3.5
    assert n.as_finite_float_or_none(None) is None
    assert n.as_finite_float_or_none(True) is None
    assert n.as_finite_float_or_none(False) is None
    assert n.as_finite_float_or_none(float('nan')) is None
    assert n.as_finite_float_or_none(float('inf')) is None


@pytest.mark.parametrize(
    'value,expected',
    [
        (float('nan'), True),
        (float('inf'), True),
        (-0.0, False),
        (1.0, False),
        (True, False),
        ('x', False),
    ],
)
def test_is_nonfinite_numeric_placeholder(value, expected):
    assert n.is_nonfinite_numeric_placeholder(value) is expected


def test_merge_finite_numeric_range_dict():
    assert n.merge_finite_numeric_range_dict(None, float('nan')) is None
    assert n.merge_finite_numeric_range_dict(None, 2.0) == {'min': 2.0, 'max': 2.0}
    assert n.merge_finite_numeric_range_dict({'min': 1.0, 'max': 3.0}, 2.5) == {
        'min': 1.0,
        'max': 3.0,
    }
    assert n.merge_finite_numeric_range_dict({'min': float('nan'), 'max': 1.0}, 5.0) == {
        'min': 5.0,
        'max': 5.0,
    }


def test_merge_numeric_sample_into_range_dict():
    rng = {'min': float('nan'), 'max': 10.0}
    assert n.merge_numeric_sample_into_range_dict(rng, 3.0) is True
    assert math.isfinite(rng['min']) and math.isfinite(rng['max'])
    assert rng['min'] <= rng['max']

    bad = {'min': 0.0, 'max': 1.0}
    assert n.merge_numeric_sample_into_range_dict(bad, float('nan')) is False


def test_finalize_metadata_keys_numerical_range():
    r = {'min': float('nan'), 'max': float('inf')}
    n.finalize_metadata_keys_numerical_range(r)
    assert r == {'min': 0.0, 'max': 0.0}

    r2 = {'min': 5.0, 'max': 1.0}
    n.finalize_metadata_keys_numerical_range(r2)
    assert r2['min'] <= r2['max']


def test_finite_numeric_samples_and_safe_min_max():
    vals = [1, 2.0, float('nan'), True, 'skip', float('inf'), 3]
    assert n.finite_numeric_samples(vals) == [1.0, 2.0, 3.0]
    assert n.safe_min_max(vals) == (1.0, 3.0)
    assert n.safe_min_max([float('nan')]) is None


def test_categorical_values_for_schema():
    out = n.categorical_values_for_schema([1.0, float('nan'), 'a', None])
    assert out == [1.0, 'a', None]


def test_repair_numerical_ranges_in_metadata_keys_doc():
    doc = {
        'metadataKeys': {
            'n': {'category': 'numerical', 'range': {'min': float('nan'), 'max': 2.0}},
            'c': {'category': 'categorical', 'set': [1.0]},
        }
    }
    assert n.repair_numerical_ranges_in_metadata_keys_doc(doc) is True
    assert math.isfinite(doc['metadataKeys']['n']['range']['min'])
    assert math.isfinite(doc['metadataKeys']['n']['range']['max'])


def test_sanitize_categorical_sets_in_metadata_keys_doc():
    doc = {
        'metadataKeys': {
            'c': {
                'category': 'categorical',
                'set': ['x', float('nan'), 2.0],
            }
        }
    }
    assert n.sanitize_categorical_sets_in_metadata_keys_doc(doc) is True
    assert doc['metadataKeys']['c']['set'] == ['x', 2.0]


def test_sanitize_value_tree_for_girder_json_dict_and_list():
    d = {'a': float('nan'), 'b': [1.0, float('inf'), 2.0]}
    assert n.sanitize_value_tree_for_girder_json(d, minmax_keys_to_zero=False) is True
    assert d['a'] is None
    assert d['b'] == [1.0, 2.0]

    d2 = {'min': float('nan'), 'max': float('inf')}
    n.sanitize_value_tree_for_girder_json(d2, minmax_keys_to_zero=True)
    assert d2['min'] == 0.0 and d2['max'] == 0.0


def test_deep_strip_nonfinite_numbers_uses_minmax_zero():
    doc = {'metadataKeys': {'n': {'range': {'min': float('nan'), 'max': 1.0}}}}
    n.deep_strip_nonfinite_numbers(doc)
    assert doc['metadataKeys']['n']['range']['min'] == 0.0


def test_coerce_export_empty_strings():
    d = {'a': None, 'b': float('nan'), 'c': 'NaN', 'd': [None, float('nan')]}
    n.coerce_export_empty_strings(d)
    assert d['a'] == '' and d['b'] == '' and d['c'] == ''
    assert d['d'] == ['', '']


def test_sanitize_metadata_keys_doc_for_api_round_trip_json():
    doc = {
        'metadataKeys': {
            'num': {'category': 'numerical', 'range': {'min': float('nan'), 'max': float('inf')}},
            'cat': {'category': 'categorical', 'set': [1.0, float('nan'), 'z']},
        },
        'root': '507f1f77bcf86cd799439011',
    }
    n.sanitize_metadata_keys_doc_for_api(doc)
    json.dumps(doc, allow_nan=False)
