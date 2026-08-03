"""
DIVE metadata ingest running on the Celery ``local`` queue.

Loads folder IDs / item IDs from the Girder job and calls the same core helpers
used by the former request-thread endpoints.
"""

from __future__ import annotations

import json
import threading
import traceback
from typing import Any, Dict

from girder.models.user import User
from girder_jobs.models.job import Job
from girder_worker.utils import JobStatus


def _job_canceled(job) -> bool:
    job = Job().load(id=job['_id'], force=True)
    return not job or job['status'] in {JobStatus.CANCELED, JobStatus.ERROR}


def _set_ingest_result(job, result: Dict[str, Any], *, status, log: str) -> None:
    meta = dict(job.get('meta') or {})
    # Keep result compact for the job document (clients poll this).
    compact = dict(result)
    keys = compact.get('metadataKeys')
    if isinstance(keys, dict):
        compact['metadataKeys'] = {'_keyCount': len(keys)}
    # Bulk update row results can be huge; summarize.
    if isinstance(compact.get('results'), list):
        rows = compact['results']
        status_counts: Dict[str, int] = {}
        for row in rows:
            st = row.get('status', 'unknown') if isinstance(row, dict) else 'unknown'
            status_counts[st] = status_counts.get(st, 0) + 1
        compact['results'] = {
            'rowCount': len(rows),
            'statusCounts': status_counts,
        }
    meta['diveMetadataIngestResult'] = compact
    Job().updateJob(job, status=status, log=log, otherFields={'meta': meta})


def metadata_ingest_task(base_job) -> None:
    """Run metadata ingest for an existing Girder job document."""
    params = base_job['kwargs']['params']
    operation = params.get('operation')
    user_id = params.get('userId')
    user = User().load(user_id, force=True)
    if user is None:
        Job().updateJob(
            base_job,
            log=f'User {user_id} not found\n',
            status=JobStatus.ERROR,
        )
        return

    base_job = Job().updateJob(
        base_job,
        log=f'Started DIVE metadata ingest ({operation})\n',
        status=JobStatus.RUNNING,
    )

    try:
        # Import inside the task so worker process has Girder models loaded.
        from girder_client import GirderClient

        from dive_server.crud_metadata_ingest import (
            run_bulk_update_from_item_core,
            run_create_metadata_folder_core,
            run_create_metadata_recursive_core,
            run_index_metadata_folder_core,
            run_process_metadata_core,
        )

        if _job_canceled(base_job):
            return

        # Download files via HTTP (same pattern as batch postprocess) so the
        # localworker does not need a shared filesystem assetstore mount.
        girder_client = None
        api_url = params.get('girderApiUrl')
        token = params.get('girderToken')
        if api_url and token:
            girder_client = GirderClient(apiUrl=api_url)
            girder_client.token = token

        result: Dict[str, Any]
        if operation == 'create_metadata_folder':
            result = run_create_metadata_folder_core(
                user=user,
                parent_folder_id=params['parentFolderId'],
                name=params.get('name', 'DIVE Metadata'),
                root_folder_id=params['rootFolderId'],
                display_config=params.get('displayConfig'),
                ffprobe_metadata=params.get('ffprobeMetadata'),
                categorical_limit=params.get('categoricalLimit', 50),
                job=base_job,
            )
        elif operation == 'create_metadata_recursive':
            result = run_create_metadata_recursive_core(
                user=user,
                resource_id=params['resourceId'],
                resource_type=params.get('resourceType', 'folder'),
                scope=params.get('scope', 'subfolders'),
                name=params.get('name', 'DIVE Metadata'),
                parent_folder_id=params.get('parentFolderId'),
                display_config=params.get('displayConfig'),
                ffprobe_metadata=params.get('ffprobeMetadata'),
                categorical_limit=params.get('categoricalLimit', 50),
                job=base_job,
            )
        elif operation == 'index_metadata_folder':
            result = run_index_metadata_folder_core(
                user=user,
                metadata_folder_id=params['metadataFolderId'],
                root_folder_id=params['rootFolderId'],
                replace_metadata=params.get('replaceMetadata', False),
                ffprobe_metadata=params.get('ffprobeMetadata'),
                job=base_job,
            )
        elif operation == 'process_metadata':
            if girder_client is None:
                raise RuntimeError(
                    'process_metadata requires girderApiUrl and girderToken for file download'
                )
            result = run_process_metadata_core(
                user=user,
                folder_id=params['folderId'],
                sibling_path=params.get('sibling_path', 'info'),
                file_type=params.get('fileType', 'ndjson'),
                matcher=params.get('matcher', 'Filename'),
                path_key=params.get('path_key', 'Key'),
                display_config=params.get('displayConfig'),
                ffprobe_metadata=params.get('ffprobeMetadata'),
                categorical_limit=params.get('categoricalLimit', 50),
                additive=params.get('additive', False),
                job=base_job,
                girder_client=girder_client,
            )
        elif operation == 'bulk_update':
            if girder_client is None:
                raise RuntimeError(
                    'bulk_update requires girderApiUrl and girderToken for file download'
                )
            result = run_bulk_update_from_item_core(
                user=user,
                root_folder_id=params['rootFolderId'],
                item_id=params['itemId'],
                replace=params.get('replace', False),
                job=base_job,
                girder_client=girder_client,
            )
        else:
            raise ValueError(f'Unknown operation: {operation}')

        if _job_canceled(base_job):
            return

        base_job = Job().load(id=base_job['_id'], force=True)
        _set_ingest_result(
            base_job,
            result if isinstance(result, dict) else {'ok': bool(result)},
            status=JobStatus.SUCCESS,
            log=f'Finished DIVE metadata ingest ({operation}): '
            f'{json.dumps(_summarize_for_log(result))}\n',
        )
    except Exception as exc:
        Job().updateJob(
            base_job,
            log=f'Error during DIVE metadata ingest ({operation}): {exc}\n'
            f'{traceback.format_exc()}\n',
            status=JobStatus.ERROR,
        )


def _summarize_for_log(result: Any) -> Any:
    if not isinstance(result, dict):
        return result
    out = {k: v for k, v in result.items() if k != 'metadataKeys'}
    keys = result.get('metadataKeys')
    if isinstance(keys, dict):
        out['metadataKeyCount'] = len(keys)
    if isinstance(out.get('results'), list):
        out['resultRowCount'] = len(out['results'])
        del out['results']
    if isinstance(out.get('errors'), list) and len(out['errors']) > 20:
        out['errors'] = out['errors'][:20] + [f'... ({len(result["errors"])} total)']
    return out


def metadataIngestTaskLauncher(job):
    """Legacy local-job entrypoint (daemon thread). Prefer Celery ``run_metadata_ingest_job``."""
    proc = threading.Thread(target=metadata_ingest_task, args=(job,), daemon=True)
    proc.start()
    return job, proc
