"""
REST API that serves Girder folders as Hugging Face style model repositories.

transformers.js builds file URLs as
``<remoteHost><org>/<repo>/resolve/<revision>/<file>``; with
``env.remoteHost = '<origin>/api/v1/dive_hf_models/'`` it reads models
straight from Girder.
"""

import cherrypy
from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.api.rest import Resource
from girder.constants import AccessType, TokenScope
from girder.models.file import File
from girder.models.setting import Setting

from . import constants, crud
from .paths import collapse_resolve_path


class HFModelsResource(Resource):
    def __init__(self, resourceName='dive_hf_models'):
        super().__init__()
        self.resourceName = resourceName
        self.route('GET', ('repos',), self.list_repos)
        self.route('GET', ('config',), self.get_config)
        self.route('PUT', ('config',), self.put_config)
        self.route('POST', ('import',), self.import_zip)
        self.route('GET', (':org', ':repo', 'resolve', ':revision', ':path'), self.resolve)

    def handleRoute(self, method, path, params):
        # A model file can be nested at any depth (onnx/model.onnx); fold the
        # tail of the path into the single :path token.
        return super().handleRoute(method, collapse_resolve_path(path), params)

    @access.public(scope=TokenScope.DATA_READ, cookie=True)
    @autoDescribeRoute(
        Description('Download a model file, Hugging Face "resolve" style.')
        .notes(
            'Serves <root collection>/<org>/<repo>/<path>. The revision is accepted '
            'for URL compatibility and ignored. Accepts the HTTP "Range" header.'
        )
        .param('org', 'Model organization, e.g. onnx-community', paramType='path')
        .param('repo', 'Model name, e.g. sam2.1-hiera-tiny-ONNX', paramType='path')
        .param('revision', 'Revision (ignored), e.g. main', paramType='path')
        .param('path', 'File path in the repository, e.g. onnx/model.onnx', paramType='path')
        .errorResponse('File not found.', 404)
        .errorResponse('Read access was denied on the model folder.', 403)
    )
    def resolve(self, org, repo, revision, path):
        file = crud.resolve_file(f'{org}/{repo}', path, user=self.getCurrentUser())
        offset, end_byte = 0, None
        range_header = cherrypy.lib.httputil.get_ranges(
            cherrypy.request.headers.get('Range'), file.get('size', 0)
        )
        if range_header:
            offset, end_byte = range_header[0]
        return File().download(file, offset, endByte=end_byte, contentDisposition='inline')

    @access.public(scope=TokenScope.DATA_READ)
    @autoDescribeRoute(Description('List the model repositories the current user can read.'))
    def list_repos(self):
        return crud.list_repos(self.getCurrentUser())

    @access.public
    @autoDescribeRoute(
        Description('Get where browsers load transformers.js models from.').notes(
            'source is auto (DIVE-DSA when it has the model, else the Hugging Face Hub), '
            'huggingface, local (DIVE-DSA only) or custom (customHost).'
        )
    )
    def get_config(self):
        return Setting().get(constants.MODEL_SOURCE_SETTING)

    @access.admin
    @autoDescribeRoute(
        Description('Set where browsers load transformers.js models from.').jsonParam(
            'config',
            'An object: {"source": "auto|huggingface|local|custom", "customHost": URL}',
            paramType='body',
            requireObject=True,
        )
    )
    def put_config(self, config):
        return Setting().set(constants.MODEL_SOURCE_SETTING, config)['value']

    @access.admin
    @autoDescribeRoute(
        Description('Extract an uploaded model zip into the model root collection.')
        .notes(
            'Upload the zip anywhere in Girder first (the dive-hf-models CLI does this). '
            'Files go to <root collection>/<org>/<repo>/; an existing repository is '
            'replaced only with replace=true, and only after the extraction succeeds.'
        )
        .modelParam(
            'fileId', 'The uploaded zip file', model=File, level=AccessType.READ, paramType='query'
        )
        .param(
            'repoId',
            'Model id <org>/<repo>; defaults to the zip manifest or its <org>/<repo>/ directory',
            required=False,
        )
        .param('revision', 'Revision to record (default: manifest or main)', required=False)
        .param(
            'replace',
            'Replace an existing model',
            dataType='boolean',
            default=False,
            required=False,
        )
        .param(
            'deleteZip',
            'Delete the zip after a successful import',
            dataType='boolean',
            default=True,
            required=False,
        )
    )
    def import_zip(self, file, repoId, revision, replace, deleteZip):
        result = crud.import_zip(
            file, self.getCurrentUser(), repo_id=repoId, revision=revision, replace=replace
        )
        if deleteZip:
            crud.remove_source_zip(file)
        return result
