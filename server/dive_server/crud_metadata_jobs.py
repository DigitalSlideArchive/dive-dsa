"""Enqueue DIVE metadata ingest work onto the Celery ``local`` queue."""

from __future__ import annotations

from typing import Any, Dict, Optional

from girder.api.rest import getApiUrl
from girder.models.setting import Setting
from girder.models.token import Token
from girder_jobs.models.job import Job
from girder_plugin_worker.utils import getWorkerApiUrl

# Job types returned to clients / shown in the Jobs UI
JOB_TYPE_CREATE_FOLDER = 'DIVE Metadata Create Folder'
JOB_TYPE_CREATE_RECURSIVE = 'DIVE Metadata Create Recursive'
JOB_TYPE_INDEX_FOLDER = 'DIVE Metadata Index Folder'
JOB_TYPE_PROCESS = 'DIVE Metadata Process'
JOB_TYPE_BULK_UPDATE = 'DIVE Metadata Bulk Update'

_TITLE_BY_OPERATION = {
    'create_metadata_folder': 'Create DIVE Metadata Folder',
    'create_metadata_recursive': 'Create DIVE Metadata (recursive)',
    'index_metadata_folder': 'Index DIVE Metadata Folder',
    'process_metadata': 'Process DIVE Metadata',
    'bulk_update': 'Bulk Update DIVE Metadata',
}

_TYPE_BY_OPERATION = {
    'create_metadata_folder': JOB_TYPE_CREATE_FOLDER,
    'create_metadata_recursive': JOB_TYPE_CREATE_RECURSIVE,
    'index_metadata_folder': JOB_TYPE_INDEX_FOLDER,
    'process_metadata': JOB_TYPE_PROCESS,
    'bulk_update': JOB_TYPE_BULK_UPDATE,
}


def enqueue_metadata_ingest_job(
    user: Dict[str, Any],
    operation: str,
    params: Dict[str, Any],
    *,
    title: Optional[str] = None,
    job_type: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Create a Girder local job and schedule it on the Celery ``local`` queue.

    ``params`` must stay small (IDs and flags). Large payloads belong in Girder
    items referenced by ``itemId``. File bytes are loaded on the worker via
    GirderClient HTTP download (no shared assetstore mount required).
    """
    if operation not in _TYPE_BY_OPERATION:
        raise ValueError(f'Unknown metadata ingest operation: {operation}')

    token = Token().createToken(user=user, days=2)
    if not Setting().get('worker.api_url'):
        Setting().set('worker.api_url', getApiUrl())

    job_params = dict(params)
    job_params['operation'] = operation
    job_params['userId'] = str(user['_id'])
    job_params['girderToken'] = str(token['_id'])
    job_params['girderApiUrl'] = getWorkerApiUrl()

    job = Job().createLocalJob(
        module='dive_tasks.dive_metadata_ingest',
        function='metadataIngestTaskLauncher',
        kwargs={'params': job_params},
        title=title or _TITLE_BY_OPERATION[operation],
        type=job_type or _TYPE_BY_OPERATION[operation],
        user=user,
        public=True,
        asynchronous=True,
    )
    from dive_tasks.local_tasks import run_metadata_ingest_job

    # createLocalJob is the job of record. Disable girder_worker's automatic
    # Celery job (defaults to title "<unnamed job>") so we do not get a duplicate.
    run_metadata_ingest_job.delay(str(job['_id']), girder_job_disable=True)
    return job
