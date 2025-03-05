from contextlib import suppress
import json
import os
from pathlib import Path
import tempfile
from typing import Dict, List
import zipfile
from typing import TypedDict, Optional, List

from GPUtil import getGPUs
from girder_client import GirderClient
from girder_worker.app import app
from girder_worker.task import Task
from girder_worker.utils import JobManager, JobStatus

from dive_tasks import utils
from dive_tasks.frame_alignment import check_and_fix_frame_alignment
from dive_tasks.manager import patch_manager
from dive_utils import constants, fromMeta
from dive_utils.types import AvailableJobSchema, GirderModel


class DiveDatasetList(TypedDict):
    DIVEDataset: str
    DIVEMetadata: str
    DIVEMetadataRoot: str
    DIVEDatasetName: str
    DIVEVideo: Optional[str]


@app.task(bind=True, acks_late=True, ignore_result=True)
def batch_slicer_cli_task(
    self: Task, divedataset: List[DiveDatasetList], cliItem: str, params: dict, user_id: str, user_login: str, skip_transcoding=False
):
    context: dict = {}
    gc: GirderClient = self.girder_client
    manager: JobManager = patch_manager(self.job_manager)
    if utils.check_canceled(self, context):
        manager.updateStatus(JobStatus.CANCELED)
        return

    # Using the base jobs get the 