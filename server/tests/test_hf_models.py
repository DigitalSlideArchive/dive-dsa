"""Unit tests for the dive_hf_models path helpers and CLI file selection."""

from __future__ import annotations

import json
from pathlib import Path
import zipfile

import pytest

from dive_hf_models.paths import (
    MANIFEST_NAME,
    collapse_resolve_path,
    split_file_path,
    stripped_prefix,
    validate_repo_id,
    zip_member_paths,
)

SAM_TINY_FILES = [
    '.gitattributes',
    'config.json',
    'preprocessor_config.json',
    'processor_config.json',
    'onnx/prompt_encoder_mask_decoder.onnx',
    'onnx/prompt_encoder_mask_decoder.onnx_data',
    'onnx/prompt_encoder_mask_decoder_q4.onnx',
    'onnx/prompt_encoder_mask_decoder_q4.onnx_data',
    'onnx/prompt_encoder_mask_decoder_q4f16.onnx',
    'onnx/prompt_encoder_mask_decoder_q4f16.onnx_data',
    'onnx/vision_encoder_fp16.onnx',
    'onnx/vision_encoder_q4.onnx',
    'onnx/vision_encoder_q4.onnx_data',
    'onnx/vision_encoder_quantized.onnx',
]


@pytest.mark.parametrize(
    'repo_id,expected',
    [
        ('onnx-community/sam2.1-hiera-tiny-ONNX', ('onnx-community', 'sam2.1-hiera-tiny-ONNX')),
        ('Xenova/clip_vit', ('Xenova', 'clip_vit')),
    ],
)
def test_validate_repo_id(repo_id, expected):
    assert validate_repo_id(repo_id) == expected


@pytest.mark.parametrize(
    'repo_id', ['', 'gpt2', 'a/b/c', '../x', 'org/..', 'org/a..b', 'org/.hidden', 'org/x.git']
)
def test_validate_repo_id_rejects(repo_id):
    with pytest.raises(ValueError):
        validate_repo_id(repo_id)


def test_split_file_path():
    assert split_file_path('onnx/vision_encoder_q4.onnx') == ['onnx', 'vision_encoder_q4.onnx']
    for bad in ['', '/etc/passwd', 'onnx/../x', 'a//b', './a', 'a\\b']:
        with pytest.raises(ValueError):
            split_file_path(bad)


def test_collapse_resolve_path():
    assert collapse_resolve_path(('o', 'r', 'resolve', 'main', 'config.json')) == (
        'o',
        'r',
        'resolve',
        'main',
        'config.json',
    )
    assert collapse_resolve_path(('o', 'r', 'resolve', 'main', 'onnx', 'sub', 'm.onnx')) == (
        'o',
        'r',
        'resolve',
        'main',
        'onnx/sub/m.onnx',
    )
    # Other routes are untouched.
    assert collapse_resolve_path(('repos',)) == ('repos',)
    assert collapse_resolve_path(('a', 'b', 'c', 'd', 'e', 'f')) == ('a', 'b', 'c', 'd', 'e', 'f')


def test_zip_member_paths_flat():
    names = ['config.json', 'onnx/', 'onnx/m.onnx', MANIFEST_NAME]
    assert zip_member_paths(names) == [
        ('config.json', 'config.json'),
        ('onnx/m.onnx', 'onnx/m.onnx'),
    ]
    assert stripped_prefix(names) is None


def test_zip_member_paths_strips_wrapping_dirs():
    names = [
        'onnx-community/sam/config.json',
        'onnx-community/sam/onnx/m.onnx',
        f'onnx-community/sam/{MANIFEST_NAME}',
        '__MACOSX/onnx-community/._config.json',
    ]
    assert zip_member_paths(names) == [
        ('onnx-community/sam/config.json', 'config.json'),
        ('onnx-community/sam/onnx/m.onnx', 'onnx/m.onnx'),
    ]
    assert stripped_prefix(names) == 'onnx-community/sam'


def test_zip_member_paths_rejects_traversal():
    with pytest.raises(ValueError):
        zip_member_paths(['config.json', '../../evil.sh'])
    with pytest.raises(ValueError):
        zip_member_paths(['/abs/config.json'])


cli = pytest.importorskip('dive_hf_models.cli')


def test_onnx_dtype():
    assert cli.onnx_dtype('onnx/vision_encoder_q4.onnx') == 'q4'
    assert cli.onnx_dtype('onnx/vision_encoder_q4f16.onnx_data') == 'q4f16'
    assert cli.onnx_dtype('onnx/model.onnx_data_1') == 'fp32'
    assert cli.onnx_dtype('onnx/model_quantized.onnx') == 'quantized'
    assert cli.onnx_dtype('config.json') is None


def test_select_files_default_q4():
    assert cli.select_files(SAM_TINY_FILES) == [
        'config.json',
        'onnx/prompt_encoder_mask_decoder_q4.onnx',
        'onnx/prompt_encoder_mask_decoder_q4.onnx_data',
        'onnx/vision_encoder_q4.onnx',
        'onnx/vision_encoder_q4.onnx_data',
        'preprocessor_config.json',
        'processor_config.json',
    ]


def test_select_files_dtypes_and_includes():
    selected = cli.select_files(
        SAM_TINY_FILES, dtypes=('fp32', 'fp16'), includes=('.gitattributes',)
    )
    assert 'onnx/prompt_encoder_mask_decoder.onnx_data' in selected
    assert 'onnx/vision_encoder_fp16.onnx' in selected
    assert '.gitattributes' in selected
    assert not any('_q4' in f for f in selected)
    assert cli.select_files(SAM_TINY_FILES, all_files=True) == sorted(SAM_TINY_FILES)


def test_zip_directory_round_trips_through_member_paths(tmp_path: Path):
    model = tmp_path / 'sam2.1-hiera-tiny-ONNX'
    (model / 'onnx').mkdir(parents=True)
    (model / '.cache' / 'huggingface').mkdir(parents=True)
    (model / 'config.json').write_text('{}')
    (model / 'onnx' / 'm_q4.onnx').write_bytes(b'onnx')
    (model / '.cache' / 'huggingface' / 'x.lock').write_text('')
    (model / '.gitattributes').write_text('')
    out = cli.zip_directory(model, tmp_path / 'm.zip', 'onnx-community/sam2.1-hiera-tiny-ONNX')
    with zipfile.ZipFile(out) as zf:
        names = zf.namelist()
        manifest = json.loads(zf.read(MANIFEST_NAME))
    assert manifest['repoId'] == 'onnx-community/sam2.1-hiera-tiny-ONNX'
    assert [rel for _, rel in zip_member_paths(names)] == ['config.json', 'onnx/m_q4.onnx']


def test_normalize_model_source():
    from dive_hf_models.source import normalize_model_source

    assert normalize_model_source(None) == {'source': 'auto', 'customHost': None}
    assert normalize_model_source({'source': 'huggingface', 'customHost': 'x'}) == {
        'source': 'huggingface',
        'customHost': None,
    }
    assert normalize_model_source(
        {'source': 'custom', 'customHost': ' https://models.example.org/hf '}
    ) == {'source': 'custom', 'customHost': 'https://models.example.org/hf/'}
    for bad in [
        'local',
        {'source': 's3'},
        {'source': 'custom'},
        {'source': 'custom', 'customHost': 'ftp://x'},
        {'source': 'custom', 'customHost': 'not a url'},
    ]:
        with pytest.raises(ValueError):
            normalize_model_source(bad)
