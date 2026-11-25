"""
Integration-style tests: bulk CSV / JSON import shapes must serialize with
``json.dumps(..., allow_nan=False)`` the same way ``metadata_keys`` and
``filter_folder`` responses do after sanitization.
"""

from __future__ import annotations

import io
import json

import pandas as pd
import pytest

pytest.importorskip('girder')

from dive_server.crud_metadata_ingest import (  # noqa: E402
    _loads_metadata_import_json,
    normalize_metadata_row_for_storage,
)
from dive_utils.metadata.numeric import (  # noqa: E402
    sanitize_metadata_keys_doc_for_api,
    sanitize_value_tree_for_girder_json,
)


def _assert_strict_json(obj):
    encoded = json.dumps(obj, allow_nan=False)
    assert 'NaN' not in encoded and 'Infinity' not in encoded
    json.loads(encoded)


@pytest.mark.integration
def test_csv_sparse_numeric_cells_round_trip_strict_json():
    """Pandas leaves NaN for empty cells; normalize must yield strict-JSON dicts."""
    csv_text = (
        'DIVEDataset,Filename,Score,Label,EmptyNum\n'
        'ds1,video_a.mp4,1.5,hello,\n'
        'ds1,video_b.mp4,,world,\n'
    )
    df = pd.read_csv(io.StringIO(csv_text))
    records = df.to_dict(orient='records')
    assert len(records) == 2
    for row in records:
        norm, _desc = normalize_metadata_row_for_storage(row)
        _assert_strict_json(norm)


@pytest.mark.integration
def test_json_nan_infinity_literals_round_trip_strict_json():
    """Loose JSON NaN/Infinity become None at parse time; row still strict-JSON after normalize."""
    payload = (
        '[{"DIVEDataset": "x", "Filename": "a.mp4", "v": NaN, "nested": {"x": Infinity}},'
        '{"DIVEDataset": "y", "k": [1, -Infinity, 2]}]'
    )
    data = _loads_metadata_import_json(payload)
    for row in data:
        norm, _desc = normalize_metadata_row_for_storage(row)
        _assert_strict_json(norm)
    assert data[0]['v'] is None
    assert data[0]['nested']['x'] is None
    assert data[1]['k'] == [1, None, 2]


@pytest.mark.integration
def test_metadata_keys_doc_like_get_metadata_keys_round_trip():
    """Mirrors get_metadata_keys: sanitize_metadata_keys_doc_for_api then strict JSON."""
    doc = {
        '_id': '507f1f77bcf86cd799439011',
        'root': '507f191e810c19729de860ea',
        'metadataKeys': {
            'Width': {
                'category': 'numerical',
                'range': {'min': float('nan'), 'max': 1920.0},
            },
            'Tag': {
                'category': 'categorical',
                'set': ['a', float('nan'), 3.0],
            },
        },
        'unlocked': [],
    }
    sanitize_metadata_keys_doc_for_api(doc)
    _assert_strict_json(doc)


@pytest.mark.integration
def test_filter_page_results_like_filter_folder_round_trip():
    """Mirrors filter_folder: sanitize each metadata row then encode structured_results."""
    page_list = [
        {
            '_id': '507f1f77bcf86cd799439011',
            'DIVEDataset': '507f191e810c19729de860ea',
            'filename': 'a.mp4',
            'root': 'rootid',
            'metadata': {'Score': float('nan'), 'Notes': [1.0, float('inf')]},
        }
    ]
    for doc in page_list:
        sanitize_value_tree_for_girder_json(doc, minmax_keys_to_zero=False)
    structured = {
        'totalPages': 1,
        'pageResults': page_list,
        'count': 1,
        'filtered': 1,
    }
    _assert_strict_json(structured)
