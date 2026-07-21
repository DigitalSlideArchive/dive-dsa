"""
Celery tasks bound to the ``local`` queue (same queue as Girder's ``importDataTask``).

Kept separate from ``tasks.py`` so the main worker task module stays focused on
GPU/default-queue work.
"""

from girder_worker.app import app


@app.task(queue='local', acks_late=True, ignore_result=True)
def run_batch_postprocess_job(job_id: str):
    """
    Run DIVE batch postprocess for an existing Girder job document.

    Scheduled on ``local`` so this runs in a normal Celery task instead of a
    daemon thread spawned from ``scheduleLocal``. A thread started when the
    import task is finishing is unreliable and often leaves the parent job
    stuck in INACTIVE.
    """
    from girder_jobs.models.job import Job

    from dive_tasks.dive_batch_postprocess import batch_postprocess_task

    job = Job().load(job_id, force=True)
    batch_postprocess_task(job)


@app.task(queue='local', acks_late=True, ignore_result=True)
def run_metadata_ingest_job(job_id: str):
    """
    Run DIVE metadata ingest (folder index, process_metadata, bulk update)
    for an existing Girder job document on the ``local`` queue.
    """
    from girder_jobs.models.job import Job

    from dive_tasks.dive_metadata_ingest import metadata_ingest_task

    job = Job().load(job_id, force=True)
    metadata_ingest_task(job)
