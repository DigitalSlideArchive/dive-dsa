import copy
from typing import Dict, List, Union

from girder_worker.task import Task
from girder_worker.utils import JobStatus

import cherrypy
import threading
import time

from girder.models.token import Token
from girder.models.user import User

from girder_jobs.models.job import Job
from girder_slicer_cli_web.models import CLIItem


from dive_utils.types import (
    DIVEMetadataSlicerCLITaskParams,
    DiveDatasetList,
)
from girder_slicer_cli_web.rest_slicer_cli import (
    get_cli_parameters,
    as_model,
    is_on_girder,
    stringifyParam,
    FOLDER_SUFFIX,
    prepare_task,
)


def cliSubHandler(cliItem, params, user, token, datalist=None):
    """
    Create a job for a Slicer CLI item and schedule it.

    :param currentItem: a CLIItem model.
    :param params: parameter dictionary passed to the endpoint.
    :param user: user model for the current user.
    :param token: allocated token for the job.
    :param datalist: if not None, an object with keys that override
        parameters.  No outputs are used.
    """
    from girder_slicer_cli_web.girder_worker_plugin.direct_docker_run import run

    cliTitle = f'DIVE Metadata Task: {cliItem.name}'
    original_params = copy.deepcopy(params)
    cherrypy.request.headers['Girder-Token'] = token['_id']

    container_args = [cliItem.name]
    reference = {
        'slicer_cli_web': {
            'title': cliTitle,
            'image': cliItem.image,
            'name': cliItem.name,
        }
    }
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

    # NOTE: I don't believe this should be needed for DIVEMetadata Jobs
    # but leaving it in if it is used in the future
    has_simple_return_file = len(simple_out_params) > 0
    # if has_simple_return_file:
    #     print('Add Simple Paramemter File Handler')
    #     _addReturnParameterFileParamToHandler(handlerDesc)

    sub_index_params, sub_opt_params = index_params, opt_params
    if datalist:
        params = params.copy()
        params.update(datalist)
        sub_index_params = [
            (
                param
                if param.name not in datalist or not is_on_girder(param)
                else stringifyParam(param)
            )
            for param in index_params
            if (param.name not in datalist or datalist.get(param.name) is not None)
            and param.name not in {k + FOLDER_SUFFIX for k in datalist}
        ]
        sub_opt_params = [
            (
                param
                if param.name not in datalist or not is_on_girder(param)
                else stringifyParam(param)
            )
            for param in opt_params
            if param.channel != 'output'
            and (param.name not in datalist or datalist.get(param.name) is not None)
            and param.name not in {k + FOLDER_SUFFIX for k in datalist}
        ]

    args, result_hooks, primary_input_name = prepare_task(
        params,
        user,
        token,
        sub_index_params,
        sub_opt_params,
        has_simple_return_file and not datalist,
        reference,
        templateParams=templateParams,
    )
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
        **job_kwargs,
    )
    jobRecord = Job().load(job.job['_id'], force=True)
    job.job['_original_params'] = jobRecord['_original_params'] = original_params
    job.job['_original_name'] = jobRecord['_original_name'] = cliItem.name
    job.job['_original_path'] = jobRecord['_original_path'] = cliItem.restBasePath
    Job().save(jobRecord)
    return jobRecord


def batchSlicerMetadataTask(job):
    """
    Run a batch of jobs via a thread.

    :param job: the job model.
    """
    proc = threading.Thread(target=metadata_filter_slicer_cli_task, args=(job,), daemon=True)
    proc.start()
    return job, proc


def create_sub_job(
    baseJob: Task,
    user: User,
    token: Token,
    base_params: DIVEMetadataSlicerCLITaskParams,
    slicer_params: Dict[str, Union[int, float, List[int], List[float], str, List[str], bool]],
    dive_params: DiveDatasetList,
    cliItem: CLIItem,
):
    dataset_params = copy.deepcopy(slicer_params)
    dataset_params['DIVEVideo'] = dive_params['DIVEVideo']
    dataset_params['DIVEDataset'] = dive_params['DIVEDataset']
    dataset_params['DIVEDirectory'] = dive_params['DIVEDataset']
    dataset_params['DIVEMetadata'] = dive_params['DIVEMetadata']
    dataset_params['DIVEMetadataRoot'] = base_params['DIVEMetadataRoot']
    dataset_params['girderToken'] = base_params['girderToken']
    dataset_params['girderApiUrl'] = base_params['girderApiUrl']
    name = dive_params['DIVEDatasetName']
    Token().createToken(user=user)
    subJob = cliSubHandler(cliItem, dataset_params, user, token)
    baseJob = Job().updateJob(
        baseJob,
        log=f'Running Slicer CLI Task: {cliItem.name} on Dive Data: {name}\n',
        status=JobStatus.RUNNING,
    )
    return subJob


def metadata_filter_slicer_cli_task(baseJob: Task):

    params: DIVEMetadataSlicerCLITaskParams = baseJob['kwargs']['params']

    dive_dataset_list = params['dataset_list']
    cli_item_id = params['cli_item']
    slicer_params = params['slicer_params']
    userId = params['userId']
    user = User().load(userId, force=True)
    token = Token().createToken(user=user)
    # Using the base jobs get the
    baseJob = Job().updateJob(
        baseJob,
        log='Started DiveMetadata processing\n',
        status=JobStatus.RUNNING,
    )

    cliItem = CLIItem.find(cli_item_id, user)
    total_count = len(dive_dataset_list)
    # try:
    scheduled = 0
    done = False
    lastSubJob = None

    try:
        while not done:
            baseJob = Job().load(id=baseJob['_id'], force=True)
            if lastSubJob:
                lastSubJob = Job().load(lastSubJob['_id'], force=True)
            if not baseJob or baseJob['status'] in {JobStatus.CANCELED, JobStatus.ERROR}:
                break
            if lastSubJob is None or lastSubJob['status'] in {
                JobStatus.SUCCESS,
                JobStatus.ERROR,
                JobStatus.CANCELED,
            }:
                if scheduled >= total_count:
                    done = True
                    break
                dive_dataset_params = dive_dataset_list[scheduled]
                if not done:
                    # We are running in a girder context, but girder_worker
                    # uses cherrypy.request.app to detect this, so we have to
                    # fake it.
                    lastSubJob = create_sub_job(
                        baseJob, user, token, params, slicer_params, dive_dataset_params, cliItem
                    )
                    Job().updateJob(
                        baseJob,
                        log=f'Scheduling job {scheduled} of {total_count} on dataset: {dive_dataset_list[scheduled]["DIVEDatasetName"]}\n',
                        progressCurrent=scheduled,
                        progressTotal=total_count,
                        status=JobStatus.RUNNING,
                    )
                    scheduled += 1
                    continue
            time.sleep(0.1)
    except Exception as exc:
        Job().updateJob(
            baseJob,
            log=f'Error During DIVEMetadata Slicer CLI Processing Item: {dive_dataset_list[scheduled]}\n',
            status=JobStatus.ERROR,
        )
        Job().updateJob(baseJob, log='Exception: %r\n' % exc)

    Job().updateJob(
        baseJob, log='Finished DIVE Metadata Batch CLI Processing', status=JobStatus.SUCCESS
    )
