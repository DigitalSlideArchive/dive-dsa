"""
Regression tests for ``crud_rpc._persist_async_job_metadata``.

The helper runs immediately after ``apply_async``, racing the worker's
``task_prerun`` INACTIVE -> RUNNING update. It must never persist the job with
``Job().save()`` (a whole-document rewrite from a possibly stale dict): that
can revert RUNNING back to INACTIVE, after which the worker's
``updateStatus(FETCHING_INPUT)`` (820, only valid from RUNNING) and its
failure-path ``updateStatus(ERROR)`` (not valid from INACTIVE) both fail with
``Invalid state transition ..., Current state is '0'``.
"""

import copy

import pytest

pytest.importorskip('girder')

from dive_server import crud_rpc  # noqa: E402


class FakeJobModel:
    """Minimal stand-in for girder_jobs Job model recording how it is used."""

    def __init__(self, stored):
        self.stored = stored
        self.update_job_calls = []

    def load(self, job_id, force=False):
        assert job_id == self.stored['_id']
        return copy.deepcopy(self.stored)

    def save(self, job, *args, **kwargs):
        raise AssertionError(
            'Job().save() must not be used to persist async job metadata: '
            'it rewrites status from a stale document and races the worker'
        )

    def copyAccessPolicies(self, src, dest):
        dest['public'] = src.get('public', False)
        if 'access' in src:
            dest['access'] = copy.deepcopy(src['access'])
        return dest

    def updateJob(self, job, otherFields=None):
        self.update_job_calls.append(dict(otherFields or {}))
        updated = copy.deepcopy(job)
        updated.update(otherFields or {})
        return updated


class FakeAsyncResult:
    def __init__(self, job_id):
        self.job = {'_id': job_id}
        self._job = None


@pytest.fixture
def fake_job_model(monkeypatch):
    # Status 2 (RUNNING): the worker has already won the race and run task_prerun.
    model = FakeJobModel({'_id': 'job1', 'status': 2, 'userId': None})
    monkeypatch.setattr(crud_rpc, 'Job', lambda: model)
    return model


def test_persist_metadata_uses_atomic_update_and_preserves_status(fake_job_model):
    result = FakeAsyncResult('job1')

    job = crud_rpc._persist_async_job_metadata(
        result, dataset_id='folder1', private_queue=False
    )

    assert fake_job_model.update_job_calls == [
        {'dataset_id': 'folder1', 'private_queue': False}
    ]
    # The returned/patched job keeps the worker's RUNNING status, untouched.
    assert job['status'] == 2
    assert job['dataset_id'] == 'folder1'
    assert result._job is job


def test_persist_without_metadata_does_not_write(fake_job_model):
    """SAM-style callers pass no fields; the job document must not be rewritten."""
    result = FakeAsyncResult('job1')

    job = crud_rpc._persist_async_job_metadata(result)

    assert fake_job_model.update_job_calls == []
    assert job['status'] == 2
    assert result._job is job


def test_persist_access_source_is_folded_into_atomic_update(fake_job_model):
    result = FakeAsyncResult('job1')
    access = {'users': [{'id': 'user1', 'level': 2}]}

    job = crud_rpc._persist_async_job_metadata(
        result,
        access_source={'public': True, 'access': access},
        dataset_id='folder1',
    )

    assert fake_job_model.update_job_calls == [
        {'dataset_id': 'folder1', 'public': True, 'access': access}
    ]
    assert job['status'] == 2
