import pytest

from dive_utils.serializers import viame


def test_load_viame_json_allows_unique_track_ids():
    payload = {
        "tracks": {
            "1": {
                "begin": 0,
                "end": 0,
                "id": 1,
                "features": [{"frame": 0, "bounds": [1, 2, 3, 4], "attributes": {}}],
                "confidencePairs": [["sample", 1.0]],
                "attributes": {},
            },
            "2": {
                "begin": 0,
                "end": 0,
                "id": 2,
                "features": [{"frame": 0, "bounds": [5, 6, 7, 8], "attributes": {}}],
                "confidencePairs": [["sample", 1.0]],
                "attributes": {},
            },
        },
        "groups": {},
        "version": 2,
    }

    converted, metadata_attributes = viame.load_json_as_track_and_attributes(payload)
    assert converted == payload
    assert metadata_attributes == {}


def test_load_viame_json_rejects_duplicate_inner_track_ids():
    payload = {
        "tracks": {
            "1": {
                "begin": 0,
                "end": 0,
                "id": 1,
                "features": [{"frame": 0, "bounds": [1, 2, 3, 4], "attributes": {}}],
                "confidencePairs": [["sample", 1.0]],
                "attributes": {},
            },
            "0": {
                "begin": 0,
                "end": 0,
                "id": 1,
                "features": [{"frame": 0, "bounds": [1, 2, 3, 4], "attributes": {}}],
                "confidencePairs": [["sample", 1.0]],
                "attributes": {},
            },
        },
        "groups": {},
        "version": 2,
    }

    with pytest.raises(ValueError, match="Duplicate track id values"):
        viame.load_json_as_track_and_attributes(payload)
