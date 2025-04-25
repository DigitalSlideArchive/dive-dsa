import os
from pathlib import Path

from girder import events, plugin
from girder.constants import AccessType
from girder.models.setting import Setting
from girder.models.user import User
from girder.plugin import getPlugin, registerPluginStaticContent
from girder.utility import mail_utils
from girder.utility.model_importer import ModelImporter
from girder_jobs.models.job import Job

from dive_utils import constants
from girder import constants as girder_constants

from .crud_annotation import GroupItem, RevisionLogItem, TrackItem
from .event import DIVES3Imports, process_fs_import, process_s3_import, send_new_user_email
from .views_annotation import AnnotationResource
from .views_configuration import ConfigurationResource
from .views_dataset import DatasetResource
from .views_override import countJobs, use_private_queue
from .views_rpc import RpcResource
from .views_metadata import DIVEMetadata

__version__ = "1.0.0"


class GirderPlugin(plugin.GirderPlugin):
    DISPLAY_NAME = 'DIVE'
    CLIENT_SOURCE_PATH = 'web_client'

    def load(self, info):
        ModelImporter.registerModel('trackItem', TrackItem, plugin='dive_server')
        ModelImporter.registerModel('groupItem', GroupItem, plugin='dive_server')
        ModelImporter.registerModel('revisionLogItem', RevisionLogItem, plugin='dive_server')

        info["apiRoot"].dive_annotation = AnnotationResource("dive_annotation")
        info["apiRoot"].dive_configuration = ConfigurationResource("dive_configuration")
        info["apiRoot"].dive_dataset = DatasetResource("dive_dataset")
        info["apiRoot"].dive_rpc = RpcResource("dive_rpc")
        info["apiRoot"].dive_metadata = DIVEMetadata("dive_metadata")

        # required because girder doesn't load plugins in order so we need to manually load first.
        getPlugin('jobs').load(info)
        getPlugin('large_image').load(info)
        # Setup route additions for exsting resources
        info['apiRoot'].job.route("GET", ("queued",), countJobs)
        info["apiRoot"].user.route("PUT", (":id", "use_private_queue"), use_private_queue)
        User().exposeFields(AccessType.READ, constants.UserPrivateQueueEnabledMarker)

        # Expose Job dataset assocation
        Job().exposeFields(AccessType.READ, constants.JOBCONST_DATASET_ID)

        DIVE_MAIL_TEMPLATES = Path(os.path.realpath(__file__)).parent / 'mail_templates'
        mail_utils.addTemplateDirectory(str(DIVE_MAIL_TEMPLATES))

        # Relocate Girder
        print(girder_constants.STATIC_ROOT_DIR)
        
        dive_path = os.path.join("/opt/dive/local/venv/share/girder/static/dive")
        conf = {
            '/': {
                'tools.staticfile.on': True,
                'tools.staticfile.filename': os.path.join(dive_path, 'index.html')
            },
            '/static': {
                'tools.staticdir.on': True,
                'tools.staticdir.dir': "/opt/dive/local/venv/share/girder/static/dive",
            }
        }
        info['serverRoot'].mount(None, '/dive', conf)
        #info['serverRoot'].mount(info['apiRoot'], '/dive/api')
        

        # info["serverRoot"], info["serverRoot"].girder = (
        #     ClientWebroot(),
        #     info["serverRoot"],
        # )

        diveS3Import = DIVES3Imports()
        events.bind(
            "rest.post.assetstore/:id/import.before",
            "process_s3_import_before",
            diveS3Import.process_s3_import_before,
        )

        events.bind(
            "rest.post.assetstore/:id/import.after",
            "process_s3_import_after",
            diveS3Import.process_s3_import_after,
        )

        events.bind(
            "filesystem_assetstore_imported",
            "process_fs_import",
            process_fs_import,
        )
        events.bind(
            "s3_assetstore_imported",
            "process_s3_import",
            process_s3_import,
        )
        events.bind(
            'model.user.save.created',
            'send_new_user_email',
            send_new_user_email,
        )

        registerPluginStaticContent(
            plugin='dive',
            css=['/style.css'],
            js=['/girder-plugin-dive.umd.cjs'],
            staticDir=Path(__file__).parent / 'web_client' / 'dist',
            tree=info['serverRoot'],
        )
