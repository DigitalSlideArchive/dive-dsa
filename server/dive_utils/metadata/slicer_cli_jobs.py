import cherrypy
import pymongo

import itertools
import json
import threading
import time

from bson.objectid import ObjectId
from typing import TypedDict, List
from girder.models.item import Item
from girder.models.setting import Setting
from girder.models.token import Token
from girder.models.user import User
from girder.constants import AccessType, SortDir

from girder import logger
from girder_jobs.constants import JobStatus
from girder_jobs.models.job import Job
from slicer_cli_web.models import CLIItem
from girder.api.rest import Resource, RestException, boundHandler, getApiUrl, getCurrentToken
from slicer_cli_web.rest_slicer_cli import genHandlerToRunDockerCLI, FOLDER_SUFFIX


class DiveDatasetList(TypedDict):
    DIVEDataset: str
    DIVEMetadata: str
    DIVEMetadataRoot: str
    DIVEDatasetName: str

def batchCLIJob(cliItem: CLIItem, params, user, cliTitle, dive_dataset_list: List[DiveDatasetList]):
    """
    Create a local asynchronous job to run a batch of other jobs.

    :param cliItem: a CLIItem model.
    :param params: parameter dictionary passed to the endpoint.
    :param user: user model for the current user.
    :param cliTitle: title of the job.
    :returns: a job model.
    """
    # We have to flog the girder_worker setting if it isn't set, since the task
    # will be run outside of a cherrypy request context, and therefore
    # girder_worker cannot determine the api_url.  Further girder_worker
    # doesn't expose its constants, so we have to use the string form.  There
    # is no way to confidently UNSET the setting, as two batches could be
    # running concurrently.
    if not Setting().get('worker.api_url'):
        Setting().set('worker.api_url', getApiUrl())
    job = Job().createLocalJob(
        module='slicer_cli_web.rest_slicer_cli',
        function='batchCLITask',
        kwargs={
            'cliItemId': str(cliItem._id),
            'params': params,
            'userId': user['_id'],
            'cliTitle': cliTitle,
            'url': cherrypy.url(),
        },
        title='Batch process %s' % cliTitle,
        type='slicer_cli_web_batch#%s#%s' % (cliItem.image, cliItem.name),
        user=user,
        public=True,
        asynchronous=True,
    )
    job['_original_params'] = params
    job['_original_name'] = cliItem.name
    job['_original_path'] = cliItem.restBasePath
    job['_dive_dataset_list'] = dive_dataset_list
    job = Job().save(job)
    Job().scheduleJob(job)
    return job


def batchCLITask(job):
    """
    Run a batch of jobs via a thread.

    :param job: the job model.
    """
    proc = threading.Thread(target=batchCLITaskProcess, args=(job,), daemon=True)
    proc.start()
    return job, proc



def batchCLITaskProcess(job):  # noqa C901
    """
    Run a batch of jobs.  The job parameters contain the id of the cli item,
    the parameters, including those for batching, and the user id.

    :param job: the job model.
    """
    params = job['kwargs']['params']
    cliTitle = job['kwargs']['cliTitle']
    user = User().load(job['kwargs']['userId'], force=True)
    token = Token().createToken(user=user)
    cliItem = CLIItem.find(job['kwargs']['cliItemId'], user)
    dive_dataset_list:  List[DiveDatasetList] = job['_dive_dataset_list']
    handler = genHandlerToRunDockerCLI(cliItem)
    batchParams = handler.getBatchParams(params)
    job = Job().updateJob(
        job, log='Started batch processing %s\n' % cliTitle,
        status=JobStatus.RUNNING)
    batchCursors = []
    count = len(dive_dataset_list)
    for item in dive_dataset_list:
        for param in params:
            if param.name == 'DIVEDirectory':
                # TODO ADD in DIVE Directory calculation
            if param.name == 'DIVEVideo':
                # TODO ADD in DIVE Video calculation

    for param in batchParams:
        q = {
            'folderId': ObjectId(params.get(param.identifier() + FOLDER_SUFFIX)),
            'name': {'$regex': params.get(param.identifier())}
        }
        if param.typ == 'image':
            q['largeImage.fileId'] = {'$exists': True}
        curparams = {'query': q, 'sort': [('lowerName', SortDir.ASCENDING)], 'user': user}
        cursor = Item().findWithPermissions(**curparams)
        batchCursors.append([cursor, curparams])
        if count is None:
            count = cursor.count()
        elif cursor.count() != count:
            job = Job().updateJob(
                job, log='Failed batch processing %s - different number '
                'of entries on batch inputs\n' % cliTitle,
                status=JobStatus.ERROR)
            return
    scheduled = 0
    done = False
    lastSubJob = None
    try:
        while not done or (lastSubJob and lastSubJob['status'] not in {
                JobStatus.CANCELED, JobStatus.ERROR, JobStatus.SUCCESS}):
            job = Job().load(id=job['_id'], force=True)
            if not job or job['status'] in {JobStatus.CANCELED, JobStatus.ERROR}:
                return
            lastSubJob = None if lastSubJob is None else Job().load(
                id=lastSubJob['_id'], force=True)
            if lastSubJob is None or lastSubJob['status'] not in {
                    JobStatus.QUEUED, JobStatus.INACTIVE}:
                jobParams = params.copy()
                paramText = []
                for idx, param in enumerate(batchParams):
                    try:
                        item = batchCursors[idx][0].next()  # noqa B305
                    except pymongo.errors.CursorNotFound:
                        # If the process takes long enough, the cursor is
                        # removed.  In this case, redo the query and keep
                        # going.
                        logger.info('Requerying batch after cursor timeout')
                        batchCursors[idx][0] = Item().findWithPermissions(
                            offset=scheduled, **batchCursors[idx][1])
                        try:
                            item = batchCursors[idx][0].next()  # noqa B305
                        except StopIteration:
                            item = None
                    except StopIteration:
                        item = None
                    if item is None:
                        done = True
                        break
                    if param.typ == 'file':
                        value = str(Item().childFiles(item, limit=1).next()['_id'])  # noqa B305
                    elif param.typ == 'image':
                        value = item['largeImage']['fileId']
                    else:
                        value = str(item['_id'])
                    jobParams.pop(param.identifier() + FOLDER_SUFFIX)
                    jobParams[param.identifier()] = value
                    paramText.append(', %s=%s' % (param.identifier(), value))
                if not done:
                    # We are running in a girder context, but girder_worker
                    # uses cherrypy.request.app to detect this, so we have to
                    # fake it.
                    _before = cherrypy.request.app
                    cherrypy.request.app = 'fake_context'
                    try:
                        lastSubJob = handler.subHandler(cliItem, jobParams, user, token).job
                    finally:
                        cherrypy.request.app = _before
                    scheduled += 1
                    Job().updateJob(
                        job, log='Scheduling job %s, %d/%d for %s%s\n' % (
                            lastSubJob['_id'], scheduled, count, cliTitle, ''.join(paramText)))
                    continue
            time.sleep(0.1)
    except Exception as exc:
        Job().updateJob(
            job, log='Error batch processing %s\n' % cliTitle,
            status=JobStatus.ERROR)
        logger.exception('Error batch processing %s\n' % cliTitle)
        Job().updateJob(job, log='Exception: %r\n' % exc)
        return
    Job().updateJob(
        job, log='Finished batch processing %s\n' % cliTitle,
        status=JobStatus.SUCCESS)
