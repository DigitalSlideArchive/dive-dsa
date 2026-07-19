"""
Unit tests for metadata ingest job enqueue helper and result compaction helpers.
"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

pytest.importorskip('girder')

from dive_server.crud_metadata_jobs import (  # noqa: E402
    JOB_TYPE_PROCESS,
    enqueue_metadata_ingest_job,
)
from dive_tasks.dive_metadata_ingest import _summarize_for_log  # noqa: E402


def test_enqueue_metadata_ingest_job_creates_local_job_and_delays():
    user = {'_id': 'user123'}
    fake_job = {'_id': 'job456', 'type': JOB_TYPE_PROCESS}
    fake_token = {'_id': 'token789'}

    with (
        patch('dive_server.crud_metadata_jobs.Job') as JobMock,
        patch('dive_server.crud_metadata_jobs.Token') as TokenMock,
        patch('dive_server.crud_metadata_jobs.Setting') as SettingMock,
        patch('dive_server.crud_metadata_jobs.getApiUrl', return_value='http://girder:8080/api/v1'),
        patch(
            'dive_server.crud_metadata_jobs.getWorkerApiUrl',
            return_value='http://girder:8080/api/v1',
        ),
        patch('dive_tasks.local_tasks.run_metadata_ingest_job') as delay_task,
    ):
        JobMock.return_value.createLocalJob.return_value = fake_job
        TokenMock.return_value.createToken.return_value = fake_token
        SettingMock.return_value.get.return_value = 'http://girder:8080/api/v1'
        delay_task.delay = MagicMock()

        result = enqueue_metadata_ingest_job(
            user,
            'process_metadata',
            {'folderId': 'folder1', 'fileType': 'ndjson'},
        )

        assert result is fake_job
        kwargs = JobMock.return_value.createLocalJob.call_args.kwargs
        assert kwargs['type'] == JOB_TYPE_PROCESS
        assert kwargs['asynchronous'] is True
        params = kwargs['kwargs']['params']
        assert params['operation'] == 'process_metadata'
        assert params['userId'] == 'user123'
        assert params['folderId'] == 'folder1'
        assert params['girderToken'] == 'token789'
        assert params['girderApiUrl'] == 'http://girder:8080/api/v1'
        delay_task.delay.assert_called_once_with('job456', girder_job_disable=True)


def test_enqueue_rejects_unknown_operation():
    with pytest.raises(ValueError, match='Unknown metadata ingest operation'):
        enqueue_metadata_ingest_job({'_id': 'u'}, 'not_real', {})


def test_summarize_for_log_trims_large_fields():
    result = {
        'added': 2,
        'metadataKeys': {'a': 1, 'b': 2, 'c': 3},
        'results': [{'status': 'success'}] * 5,
        'errors': [f'e{i}' for i in range(25)],
    }
    summary = _summarize_for_log(result)
    assert summary['added'] == 2
    assert summary['metadataKeyCount'] == 3
    assert 'metadataKeys' not in summary
    assert summary['resultRowCount'] == 5
    assert 'results' not in summary
    assert len(summary['errors']) == 21  # 20 + ellipsis
