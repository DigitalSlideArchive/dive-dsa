import errno
import json
from typing import List, Optional

import cherrypy
from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.api.rest import Resource, setRawResponse
from girder.constants import AccessType, TokenScope
from girder.exceptions import GirderException, RestException
from girder.models.file import File
from girder.models.folder import Folder
from girder.models.upload import Upload
from girder.utility import RequestBodyStream, ziputil

from dive_utils import constants, models, setContentDisposition
from dive_utils.serializers import dive, viame

from . import crud, crud_annotation

DatasetModelParam = {
    'description': "dataset id",
    'model': Folder,
    'paramType': 'query',
    'required': True,
}


GetAnnotationParams = (
    Description("Get annotations of a dataset")
    .pagingParams("id", defaultLimit=0)
    .modelParam("folderId", **DatasetModelParam, level=AccessType.READ)
    .param('revision', 'revision', dataType='integer', required=False)
)


class AnnotationResource(Resource):
    """RESTFul Annotation Resource"""

    def __init__(self, resourceName):
        super(AnnotationResource, self).__init__()
        self.resourceName = resourceName

        self.route("GET", ("track",), self.get_tracks)
        self.route("GET", ("group",), self.get_groups)
        self.route("GET", ("revision",), self.get_revisions)
        self.route("GET", ("export",), self.export)
        self.route("GET", ("labels",), self.get_labels)
        self.route("PATCH", (), self.save_annotations)
        self.route("PUT", ("track",), self.update_tracks)
        self.route("POST", ("rollback",), self.rollback)
        self.route("POST", ("process_json",), self.process_json)
        self.route("POST", ('mask',), self.update_mask)
        self.route("DELETE", ('mask',), self.delete_mask)
        self.route("POST", ('rle_mask',), self.update_rle_mask)
        self.route("GET", ('rle_mask',), self.get_rle_mask)

    @access.user
    @autoDescribeRoute(
        Description("Update mask annotations")
        .modelParam("folderId", **DatasetModelParam, level=AccessType.WRITE)
        .param("trackId", "Track ID to update", paramType="query", dataType="string")
        .param("frameId", "Frame ID to update", paramType="query", dataType="string")
        .param(
            "size",
            "Size of the png to upload",
            paramType="query",
            dataType="integer",
            required=False,
        )
        .param(
            "RLEUpdate", "Update the RLEMask", paramType="query", dataType="boolean", default=False
        )
    )
    def update_mask(self, folder, trackId, frameId, size, RLEUpdate):
        crud.verify_dataset(folder)
        user = self.getCurrentUser()
        mask_item = crud_annotation.get_mask_item(user, folder, trackId, frameId)
        chunk = None
        if size > 0 and cherrypy.request.headers.get('Content-Length'):
            ct = cherrypy.request.body.content_type.value
            if (
                ct not in cherrypy.request.body.processors
                and ct.split('/', 1)[0] not in cherrypy.request.body.processors
            ):
                chunk = RequestBodyStream(cherrypy.request.body)
        if chunk is not None and chunk.getSize() <= 0:
            chunk = None

        try:
            # TODO: This can be made more efficient by adding
            #    save=chunk is None
            # to the createUpload call parameters.  However, since this is
            # a breaking change, that should be deferred until a major
            # version upgrade.
            upload = Upload().createUpload(
                user=user,
                name=mask_item['name'],
                parentType='item',
                parent=mask_item,
                size=size,
                mimeType='image/png',
            )
        except OSError as exc:
            if exc.errno == errno.EACCES:
                raise GirderException(
                    'Failed to create upload.', 'girder.api.v1.file.create-upload-failed'
                )
            raise
        if upload['size'] > 0:
            if chunk:
                val = Upload().handleChunk(upload, chunk, filter=True, user=user)
                crud_annotation.update_RLE_masks(user, folder, [[trackId, frameId]])
                return val
            return upload
        else:
            finalized_upload = File().filter(Upload().finalizeUpload(upload), user)
            crud_annotation.update_RLE_masks(user, folder, [[trackId, frameId]])
            return finalized_upload

    @access.user
    @autoDescribeRoute(
        Description("Delete mask annotations")
        .modelParam("folderId", **DatasetModelParam, level=AccessType.WRITE)
        .param("trackId", "Track ID to delete", paramType="query", dataType="string")
        .param(
            "frameId",
            "Frame ID to delete (-1 to delete entire track)",
            paramType="query",
            dataType="string",
        )
    )
    def delete_mask(self, folder, trackId, frameId):
        crud.verify_dataset(folder)
        user = self.getCurrentUser()

        try:
            track_id = int(trackId)
            frame_id = int(frameId)
        except ValueError:
            raise RestException("trackId and frameId must be integers.", code=400)

        result = crud_annotation.delete_masks(user, folder, [(track_id, frame_id)])

        # Determine status
        if not result["deletedTracks"] and not result["deletedFrames"]:
            raise RestException("No matching masks found to delete.", code=404)

        return {
            "status": "success",
            "message": f"Masks updated for trackId={track_id}, frameId={frame_id}",
            "deleted": result,
        }

    @access.user
    @autoDescribeRoute(
        Description("Get RLE mask annotations").modelParam(
            "folderId", **DatasetModelParam, level=AccessType.WRITE
        )
    )
    def get_rle_mask(self, folder):
        crud.verify_dataset(folder)
        return crud_annotation.get_mask_json(folder)

    @access.user
    @autoDescribeRoute(
        Description("Update RLE mask annotations")
        .modelParam("folderId", **DatasetModelParam, level=AccessType.WRITE)
        .jsonParam(
            "trackFrameList",
            "List of track frame pairs to update, None will update all",
            paramType="query",
            required=False,
            default=None,
            requireArray=True,
        )
    )
    def update_rle_mask(self, folder, trackFrameList):
        crud.verify_dataset(folder)
        user = self.getCurrentUser()
        json_data = {}
        json_data = crud_annotation.update_RLE_masks(user, folder, trackFrameList)
        return json_data

    @access.user(scope=TokenScope.DATA_READ)
    @autoDescribeRoute(GetAnnotationParams)
    def get_tracks(self, limit: int, offset: int, sort, folder, revision):
        return crud_annotation.TrackItem().list(
            folder, limit=limit, offset=offset, sort=sort, revision=revision
        )

    @access.user(scope=TokenScope.DATA_READ)
    @autoDescribeRoute(GetAnnotationParams)
    def get_groups(self, limit: int, offset: int, sort, folder, revision):
        return crud_annotation.GroupItem().list(
            folder, limit=limit, offset=offset, sort=sort, revision=revision
        )

    @access.user(scope=TokenScope.DATA_READ)
    @autoDescribeRoute(
        Description("Get dataset annotation revision log")
        .pagingParams("revision", defaultLimit=20)
        .modelParam("folderId", **DatasetModelParam, level=AccessType.READ)
    )
    def get_revisions(self, limit: int, offset: int, sort, folder):
        cursor, total = crud_annotation.RevisionLogItem().list(folder, limit, offset, sort)
        cherrypy.response.headers['Girder-Total-Count'] = total
        return cursor

    @access.public(scope=TokenScope.DATA_READ, cookie=True)
    @autoDescribeRoute(
        Description("Export annotations of a clip into CSV format.")
        .modelParam("folderId", **DatasetModelParam, level=AccessType.READ)
        .param(
            "excludeBelowThreshold",
            "Exclude tracks with confidencePairs below set threshold.",
            paramType="query",
            dataType="boolean",
            default=False,
        )
        .param(
            "revisionId",
            "Optional revision to export from.  Default is latest.",
            paramType="query",
            dataType="integer",
            default=None,
            required=False,
        )
        .param(
            'format',
            'Optional export format.',
            paramType='query',
            dataType='string',
            default='viame_csv',
            enum=['viame_csv', 'dive_json', 'masks'],
            required=False,
        )
        .jsonParam(
            "typeFilter",
            "List of track types to filter by.  Default is no filtering.",
            paramType="query",
            required=False,
            default=None,
            requireArray=True,
        )
    )
    def export(
        self,
        folder,
        excludeBelowThreshold: bool,
        revisionId: int,
        format: str,
        typeFilter: Optional[List[str]],
    ):
        crud.verify_dataset(folder)

        if format == 'viame_csv':
            filename, gen = crud_annotation.get_annotation_csv_generator(
                folder,
                self.getCurrentUser(),
                excludeBelowThreshold=excludeBelowThreshold,
                typeFilter=typeFilter,
                revision=revisionId,
            )
            setContentDisposition(filename, mime='text/csv')
            return gen
        elif format == 'dive_json':
            setContentDisposition(f'{folder["name"]}.dive.json', mime='application/json')
            setRawResponse()
            annotations = crud_annotation.get_annotations(folder, revision=revisionId)
            return json.dumps(annotations).encode('utf-8')
        elif format == 'masks':
            mask_folder = crud_annotation.get_mask_folder(folder)
            if mask_folder is None:
                raise RestException("No mask folder found in this dataset.")
            else:
                user = self.getCurrentUser()
                mask_folder_id = str(mask_folder['_id'])

                def stream():
                    zip = ziputil.ZipGenerator()
                    doc = Folder().load(id=mask_folder_id, user=user, level=AccessType.READ)
                    for path, file in Folder().fileList(
                        doc=doc, user=user, includeMetadata=False, subpath=True
                    ):
                        try:
                            yield from zip.addFile(file, path)
                        except Exception as e:
                            # Optional: yield a log file or silently skip
                            raise RestException(f'Error adding file {path}: {e}')
                    yield zip.footer()

                setContentDisposition('masks.zip', mime='application/zip')
                return stream
        else:
            raise RestException(f'Format {format} is not a valid option.')

    @access.user
    @autoDescribeRoute(
        Description("Update annotations")
        .modelParam("folderId", **DatasetModelParam, level=AccessType.WRITE)
        .jsonParam("body", "upsert and delete tracks", paramType="body", requireObject=True)
        .param("preventRevision", "Prevent creation of a Revision", paramType='query', dataType="boolean", default=False)
    )
    def save_annotations(self, folder, body, preventRevision):
        crud.verify_dataset(folder)
        validated: models.Track.AnnotationUpdateArgs = crud.get_validated_model(
            crud_annotation.AnnotationUpdateArgs, **body
        )
        upsert_tracks = [track.dict(exclude_none=True) for track in validated.tracks.upsert]
        upsert_groups = [group.dict(exclude_none=True) for group in validated.groups.upsert]
        user = self.getCurrentUser()
        return crud_annotation.save_annotations(
            folder,
            user,
            upsert_tracks=upsert_tracks,
            delete_tracks=validated.tracks.delete,
            upsert_groups=upsert_groups,
            delete_groups=validated.groups.delete,
            preventRevision=preventRevision,
        )

    @access.user
    @autoDescribeRoute(
        Description("Update Tracks")
        .modelParam("folderId", **DatasetModelParam, level=AccessType.WRITE)
        .jsonParam(
            "body",
            "Additive Track Annotations to Update. In the format of {tracks: []}",
            paramType="body",
            requireObject=True,
        )
        .param("preventRevision", "Prevent creation of a Revision", paramType='query', dataType="boolean", default=False)
    )
    def update_tracks(self, folder, body, preventRevision):
        crud.verify_dataset(folder)
        validated: crud_annotation.TrackPutArgs = crud.get_validated_model(
            crud_annotation.TrackPutArgs, **body
        )
        upsert_tracks = [track.dict(exclude_none=True) for track in validated.tracks]
        user = self.getCurrentUser()
        return crud_annotation.save_annotations(
            folder,
            user,
            upsert_tracks=upsert_tracks,
            delete_tracks={},
            upsert_groups={},
            delete_groups={},
            preventRevision=preventRevision
        )

    @access.user
    @autoDescribeRoute(
        Description("Rollback annotation revision to the specified version")
        .modelParam("folderId", **DatasetModelParam, level=AccessType.WRITE)
        .param('revision', 'revision', dataType='integer')
    )
    def rollback(self, folder, revision):
        crud.verify_dataset(folder)
        crud_annotation.rollback(folder, revision)

    @access.user
    @autoDescribeRoute(
        Description("Upload a Complete TrackJSON File to system and process it for attributes")
        .modelParam("folderId", **DatasetModelParam, level=AccessType.WRITE)
        .jsonParam(
            "body",
            "TrackJSON data to upload to the folderId",
            paramType="body",
            requireObject=True,
        )
        .param(
            "additive",
            "Whether to add new annotations to existing ones.  Annotations \
            will be added with Ids starting at the last existing Id+1",
            paramType="query",
            dataType="boolean",
            default=False,
            required=False,
        )
        .param(
            "additivePrepend",
            "When using additive the prepend to types: I.E. 'prepend_type' \
            so the string will be added to all types that are imported",
            paramType="query",
            dataType="string",
            default='',
            required=False,
        )
    )
    def process_json(self, folder, body, additive, additivePrepend):
        crud.verify_dataset(folder)
        user = self.getCurrentUser()
        annotations = dive.migrate(body)
        _oldannotations, attributes = viame.load_json_as_track_and_attributes(body)
        if annotations:
            updated_tracks = annotations['tracks'].values()
            if additive:  # get annotations and add them to the end
                tracks = crud_annotation.add_annotations(
                    folder, annotations['tracks'], additivePrepend
                )
                updated_tracks = tracks.values()
            print(f'Saving Annotations: {user}')
            crud_annotation.save_annotations(
                folder,
                user,
                upsert_tracks=updated_tracks,
                upsert_groups=annotations['groups'].values(),
                overwrite=True,
                description=f'POST trackJSON from {user["login"]}',
            )
        if attributes:
            crud.saveImportAttributes(folder, attributes, user)

    @access.user
    @autoDescribeRoute(
        Description("Get all labels visible to a particular user")
        .param(
            constants.PublishedMarker,
            'Return only labels from published data',
            required=False,
            default=True,
            dataType='boolean',
        )
        .param(
            constants.SharedMarker,
            'Return only labels from data shared with me',
            required=False,
            default=True,
            dataType='boolean',
        )
    )
    def get_labels(self, published: bool, shared: bool):
        return crud_annotation.get_labels(self.getCurrentUser(), published=published, shared=shared)
