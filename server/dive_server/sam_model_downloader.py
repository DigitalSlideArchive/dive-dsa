"""
SAM2 Model Downloader - Web Server Component

This module handles downloading SAM2 models without requiring SAM2 to be installed.
It only downloads the model files and updates configuration - no SAM2 inference.
"""

import math
import os
from pathlib import Path
from urllib import request
from urllib.parse import urlparse

from girder_client import GirderClient
from girder_worker.app import app
from girder_worker.task import Task
from girder_worker.utils import JobManager, JobStatus

from dive_utils import constants


def get_filename_from_url(url):
    """Extracts the filename from a URL."""
    parsed_url = urlparse(url)
    return os.path.basename(parsed_url.path)


@app.task(bind=True, acks_late=True, ignore_result=True)
def download_sam_models_web(
    self: Task,
    sam2_config=constants.DEFAULT_SAM2_FILES,
    force: bool = False,
):
    """Download and organize SAM models - Web Server Version"""
    manager: JobManager = self.job_manager
    if self.check_canceled():
        manager.updateStatus(JobStatus.CANCELED)
        return

    gc: GirderClient = self.girder_client
    Path(constants.SAM2_MODEL_PATH).mkdir(parents=True, exist_ok=True)

    def progress_report_hook_factory(filename):
        last_percent = {'value': -1}

        def reporthook(block_num, block_size, total_size):
            downloaded = block_num * block_size
            if total_size > 0:
                percent = math.floor(downloaded * 100 / total_size)
                if percent != last_percent['value']:
                    last_percent['value'] = percent
                    manager.write(f"{filename}: {percent}% downloaded\n")
            else:
                manager.write(f"{filename}: downloading... {downloaded} bytes so far\n")

        return reporthook

    models = []
    for model_name, files in sam2_config.items():
        model_dir = Path(constants.SAM2_MODEL_PATH) / model_name
        models.append(model_name)
        model_dir.mkdir(parents=True, exist_ok=True)

        if self.check_canceled():
            manager.updateStatus(JobStatus.CANCELED)
            return

        # Download the checkpoint
        checkpoint_url = files['checkpoint']
        checkpoint_dest = model_dir / Path(checkpoint_url).name
        if not checkpoint_dest.exists() or force:
            manager.write(f"Downloading checkpoint for {model_name} - {checkpoint_url}\n")
            request.urlretrieve(
                checkpoint_url,
                checkpoint_dest,
                reporthook=progress_report_hook_factory(checkpoint_dest.name),
            )

        # Download the config
        config_url = files['config']
        config_dest = model_dir / Path(config_url).name
        if not config_dest.exists() or force:
            manager.write(f"Downloading config for {model_name} - {config_url}.\n")
            request.urlretrieve(
                config_url, config_dest, reporthook=progress_report_hook_factory(config_dest.name)
            )

        if self.check_canceled():
            manager.updateStatus(JobStatus.CANCELED)
            return

    # Update configuration
    base_dive_config = gc.get('dive_configuration/dive_config')
    manager.write(f'{base_dive_config}\n')
    sam2_base_config = base_dive_config.get('SAM2Config', {'queues': ['celery'], 'models': []})
    dive_config_queue = base_dive_config.get('celeryQueue', False)
    if dive_config_queue and dive_config_queue not in sam2_base_config.get('queues', []):
        sam2_base_config['queues'].insert(0, dive_config_queue)

    sam2_base_config['models'] = models
    base_dive_config["SAM2Config"] = sam2_base_config
    manager.write(f'{base_dive_config}\n')
    gc.put('dive_configuration/dive_config', json=base_dive_config)
