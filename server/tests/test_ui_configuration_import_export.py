"""Unit tests for UI Configuration import/export helpers."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

pytest.importorskip('girder')

from girder.exceptions import RestException  # noqa: E402

from dive_server import crud_dataset  # noqa: E402


def _folder(folder_id, name='Folder', parent_id=None, meta=None):
    return {
        '_id': folder_id,
        'name': name,
        'parentId': parent_id,
        'meta': meta or {},
    }


def _folder_model(folders):
    """Patch Folder() so findOne/load/childFolders/save resolve from a dict of id -> folder."""
    by_id = {str(f['_id']): f for f in folders}
    children = {}
    for folder in folders:
        parent_id = folder.get('parentId')
        if parent_id is not None:
            children.setdefault(str(parent_id), []).append(folder)

    instance = MagicMock()

    def find_one(query):
        return by_id.get(str(query.get('_id')))

    def load(folder_id, level=None, user=None, **_kwargs):
        return by_id.get(str(folder_id))

    def child_folders(parent, _parent_type, user=None, **_kwargs):
        return list(children.get(str(parent['_id']), []))

    def save(folder):
        by_id[str(folder['_id'])] = folder
        return folder

    instance.findOne.side_effect = find_one
    instance.load.side_effect = load
    instance.childFolders.side_effect = child_folders
    instance.save.side_effect = save

    folder_cls = MagicMock(return_value=instance)
    return folder_cls


PARENT_META = {
    'configuration': {
        'general': {'baseConfiguration': 'parent1'},
        'UISettings': {'UITopBar': True},
        'shortcuts': [{'key': 'a', 'action': 'next'}],
    },
    'attributes': {
        'color': {
            'belongs': 'track',
            'datatype': 'text',
            'name': 'Color',
            'key': 'color',
        },
    },
    'timelines': {
        'speed': {
            'enabled': True,
            'name': 'speed',
            'filter': {'type': 'attribute', 'attrKey': 'speed'},
        },
    },
    'swimlanes': {
        'status': {
            'enabled': True,
            'name': 'status',
            'filter': {'type': 'attribute', 'attrKey': 'status'},
        },
    },
    'filters': {},
    'customTypeStyling': {'fish': {'color': '#ff0000'}},
}


@pytest.fixture
def hierarchy_folders():
    parent = _folder('parent1', name='Parent', parent_id=None, meta=PARENT_META)
    child = _folder('child1', name='Child', parent_id='parent1', meta={})
    return parent, child


def test_find_ui_configuration_base_folder_prefers_self_referencing_parent(hierarchy_folders):
    parent, child = hierarchy_folders
    with patch('dive_server.crud_dataset.Folder', _folder_model([parent, child])):
        result = crud_dataset.find_ui_configuration_base_folder(child, user={})
    assert result['_id'] == 'parent1'
    assert result['name'] == 'Parent'


def test_find_ui_configuration_base_folder_falls_back_to_current_dataset():
    dataset = _folder('ds1', name='Dataset', parent_id=None, meta={})
    with patch('dive_server.crud_dataset.Folder', _folder_model([dataset])):
        result = crud_dataset.find_ui_configuration_base_folder(dataset, user={})
    assert result['_id'] == 'ds1'


def test_find_ui_configuration_base_folder_ignores_non_self_reference():
    """Parent points baseConfiguration elsewhere — treat as unset, use current."""
    parent = _folder(
        'parent1',
        meta={'configuration': {'general': {'baseConfiguration': 'someone-else'}}},
    )
    child = _folder('child1', parent_id='parent1', meta={})
    with patch('dive_server.crud_dataset.Folder', _folder_model([parent, child])):
        result = crud_dataset.find_ui_configuration_base_folder(child, user={})
    assert result['_id'] == 'child1'


def test_export_ui_configuration_resolves_parent_and_strips_base_id(hierarchy_folders):
    parent, child = hierarchy_folders
    with patch('dive_server.crud_dataset.Folder', _folder_model([parent, child])):
        data, base = crud_dataset.export_ui_configuration(child, user={})

    assert base['_id'] == 'parent1'
    assert 'attributes' in data
    assert data['attributes']['color']['key'] == 'color'
    assert 'timelines' in data
    assert 'swimlanes' in data
    assert 'configuration' in data
    assert data['configuration']['UISettings']['UITopBar'] is True
    # Portability: folder id must not be in the exported file
    assert 'baseConfiguration' not in data['configuration'].get('general', {})
    # Original folder meta must remain unchanged
    assert parent['meta']['configuration']['general']['baseConfiguration'] == 'parent1'


def test_export_ui_configuration_from_dataset_when_no_parent_base():
    dataset = _folder(
        'ds1',
        meta={
            'configuration': {'general': {'baseConfiguration': 'ds1'}},
            'attributes': {
                'a': {
                    'belongs': 'detection',
                    'datatype': 'number',
                    'name': 'A',
                    'key': 'a',
                },
            },
        },
    )
    with patch('dive_server.crud_dataset.Folder', _folder_model([dataset])):
        data, base = crud_dataset.export_ui_configuration(dataset, user={})

    assert base['_id'] == 'ds1'
    assert 'attributes' in data
    assert 'baseConfiguration' not in data['configuration']['general']


def test_import_ui_configuration_remaps_base_and_replaces_meta():
    dest = _folder(
        'dest99',
        name='Dest',
        meta={
            'attributes': {'old': {'belongs': 'track', 'datatype': 'text', 'name': 'Old', 'key': 'old'}},
            'configuration': {'general': {'baseConfiguration': 'old-server'}},
        },
    )
    payload = {
        'configuration': {
            'general': {'baseConfiguration': 'source-server-id'},
            'UISettings': {'UITopBar': False},
        },
        'attributes': {
            'color': {
                'belongs': 'track',
                'datatype': 'text',
                'name': 'Color',
                'key': 'color',
            },
        },
        'timelines': {},
        'swimlanes': {},
    }
    captured = {}

    def fake_update(folder, data, verify=True):
        captured['folder'] = folder
        captured['data'] = data
        captured['verify'] = verify
        return data

    with patch('dive_server.crud_dataset.update_metadata', side_effect=fake_update):
        with patch('dive_server.crud_dataset.Folder', _folder_model([dest])):
            result = crud_dataset.import_ui_configuration(dest, payload, user={})

    assert captured['folder']['_id'] == 'dest99'
    assert captured['verify'] is False
    assert captured['data']['configuration']['general']['baseConfiguration'] == 'dest99'
    assert captured['data']['attributes']['color']['key'] == 'color'
    assert 'old' not in captured['data']['attributes']
    assert captured['data']['configuration']['UISettings']['UITopBar'] is False
    assert result is captured['data']


def test_import_ui_configuration_clears_descendant_self_refs():
    """Parent import must demote descendant self-bases so get_configuration picks the parent."""
    parent = _folder('parent1', name='Parent', parent_id=None, meta={})
    mid = _folder(
        'mid1',
        name='Mid',
        parent_id='parent1',
        meta={'configuration': {'general': {'baseConfiguration': 'mid1', 'keep': True}}},
    )
    dataset = _folder(
        'ds1',
        name='Dataset',
        parent_id='mid1',
        meta={'configuration': {'general': {'baseConfiguration': 'ds1'}}},
    )
    sibling = _folder(
        'sib1',
        name='Sibling',
        parent_id='parent1',
        meta={'configuration': {'general': {'baseConfiguration': 'elsewhere'}}},
    )
    payload = {
        'configuration': {
            'general': {'baseConfiguration': 'source'},
            'UISettings': {'UITopBar': True},
        },
        'attributes': {},
    }

    def fake_update(folder, data, verify=True):
        folder.setdefault('meta', {}).update(data)
        return data

    with patch('dive_server.crud_dataset.update_metadata', side_effect=fake_update):
        with patch('dive_server.crud_dataset.Folder', _folder_model([parent, mid, dataset, sibling])):
            crud_dataset.import_ui_configuration(parent, payload, user={})

    assert 'baseConfiguration' not in mid['meta']['configuration']['general']
    assert mid['meta']['configuration']['general']['keep'] is True
    assert 'baseConfiguration' not in dataset['meta']['configuration']['general']
    # Non-self reference under dest is left alone
    assert sibling['meta']['configuration']['general']['baseConfiguration'] == 'elsewhere'


def test_import_ui_configuration_rejects_invalid_payload():
    dest = _folder('dest1')
    with pytest.raises(RestException) as exc_info:
        crud_dataset.import_ui_configuration(dest, {'not': 'a-config'})
    assert exc_info.value.code == 400

    with pytest.raises(RestException):
        crud_dataset.import_ui_configuration(dest, None)  # type: ignore[arg-type]

    with pytest.raises(RestException):
        crud_dataset.import_ui_configuration(dest, [])  # type: ignore[arg-type]


def test_extract_ui_configuration_meta_only_mutable_keys():
    folder = _folder(
        'x',
        meta={
            'attributes': {'a': 1},
            'annotate': True,
            'type': 'video',
            'fps': 30,
            'configuration': {'general': {}},
            'timelines': None,
        },
    )
    data = crud_dataset._extract_ui_configuration_meta(folder)
    assert set(data.keys()) == {'attributes', 'configuration'}
    assert 'annotate' not in data
    assert 'timelines' not in data
