from contextlib import suppress
import copy
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

import cherrypy
import pymongo

import itertools
import json
import threading
import time

from bson.objectid import ObjectId
from typing import TypedDict, List, Optional
from girder.models.item import Item
from girder.models.setting import Setting
from girder.models.token import Token
from girder.models.user import User
from girder.constants import AccessType, SortDir

from girder import logger
from girder_jobs.models.job import Job
from slicer_cli_web.models import CLIItem
from girder.api.rest import Resource, RestException, boundHandler, getApiUrl, getCurrentToken


from dive_tasks import utils
from dive_tasks.frame_alignment import check_and_fix_frame_alignment
from dive_tasks.manager import patch_manager
from dive_utils import constants, fromMeta
from dive_utils.types import AvailableJobSchema, GirderModel
from slicer_cli_web.rest_slicer_cli import get_cli_parameters, as_model, is_on_girder, stringifyParam, FOLDER_SUFFIX, prepare_task, _addReturnParameterFileParamToHandler

class DiveDatasetList(TypedDict):
    DIVEDataset: str
    DIVEMetadata: str
    DIVEMetadataRoot: str
    DIVEDatasetName: str
    DIVEVideo: Optional[str]



def cliSubHandler(cliItemId, params, user, token, datalist=None):
    """
    Create a job for a Slicer CLI item and schedule it.

    :param currentItem: a CLIItem model.
    :param params: parameter dictionary passed to the endpoint.
    :param user: user model for the current user.
    :param token: allocated token for the job.
    :param datalist: if not None, an object with keys that override
        parameters.  No outputs are used.
    """
    from .girder_worker_plugin.direct_docker_run import run

    cliItem = CLIItem.find(cliItemId, user)

    cliTitle=f'DIVE Metadata Task: {cliItem.name}'
    original_params = copy.deepcopy(params)
    cherrypy.request.headers['Girder-Token'] = token['_id']

    container_args = [cliItem.name]
    reference = {'slicer_cli_web': {
        'title': cliTitle,
        'image': cliItem.image,
        'name': cliItem.name,
    }}
    now = time.localtime()
    templateParams = {
        'title': cliTitle,  # e.g., "Detects Nuclei"
        'task': cliItem.name,  # e.g., "NucleiDetection"
        'image': cliItem.image,  # e.g., "dsarchive/histomicstk:latest"
        'now': time.strftime('%Y%m%d-%H%M%S', now),
        'yyyy': time.strftime('%Y', now),
        'mm': time.strftime('%m', now),
        'dd': time.strftime('%d', now),
        'HH': time.strftime('%H', now),
        'MM': time.strftime('%M', now),
        'SS': time.strftime('%S', now),
    }

    clim = as_model(cliItem.xml)
    index_params, opt_params, simple_out_params = get_cli_parameters(clim)

    has_simple_return_file = len(simple_out_params) > 0
    if has_simple_return_file:
        _addReturnParameterFileParamToHandler(handlerDesc)

    sub_index_params, sub_opt_params = index_params, opt_params
    if datalist:
        params = params.copy()
        params.update(datalist)
        sub_index_params = [
            param if param.name not in datalist or not is_on_girder(param)
            else stringifyParam(param)
            for param in index_params
            if (param.name not in datalist or datalist.get(param.name) is not None) and
            param.name not in {k + FOLDER_SUFFIX for k in datalist}]
        sub_opt_params = [
            param if param.name not in datalist or not is_on_girder(param)
            else stringifyParam(param)
            for param in opt_params
            if param.channel != 'output' and (
                param.name not in datalist or datalist.get(param.name) is not None) and
            param.name not in {k + FOLDER_SUFFIX for k in datalist}]

    args, result_hooks, primary_input_name = prepare_task(
        params, user, token, sub_index_params, sub_opt_params,
        has_simple_return_file and not datalist,
        reference, templateParams=templateParams)
    container_args.extend(args)

    jobType = '%s#%s' % (cliItem.image, cliItem.name)

    if primary_input_name:
        jobTitle = '%s on %s' % (cliTitle, primary_input_name)
    else:
        jobTitle = cliTitle

    job_kwargs = cliItem.item.get('meta', {}).get('docker-params', {})
    job = run.delay(
        girder_user=user,
        girder_job_type=jobType,
        girder_job_title=jobTitle,
        girder_result_hooks=result_hooks,
        image=cliItem.digest,
        pull_image='if-not-present',
        container_args=container_args,
        **job_kwargs
    )
    jobRecord = Job().load(job.job['_id'], force=True)
    job.job['_original_params'] = jobRecord['_original_params'] = original_params
    job.job['_original_name'] = jobRecord['_original_name'] = cliItem.name
    job.job['_original_path'] = jobRecord['_original_path'] = cliItem.restBasePath
    Job().save(jobRecord)
    return job



@app.task(bind=True, acks_late=True, ignore_result=True)
def metadata_filter_slicer_cli(
    self: Task, divedataset: List[DiveDatasetList], cliItem: str, params: dict, user_id: str, user_login: str, skip_transcoding=False
)

    context: dict = {}
    gc: GirderClient = self.girder_client
    token = self.girder_client_token
    manager: JobManager = patch_manager(self.job_manager)
    if utils.check_canceled(self, context):
        manager.updateStatus(JobStatus.CANCELED)
        return

    # Using the base jobs get the 