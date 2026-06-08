import logging
import os
from pathlib import Path

from girder import events, plugin
from girder.constants import AccessType
from girder.models.user import User
from girder.plugin import getPlugin, registerPluginStaticContent
from girder.utility import mail_utils
from girder.utility.model_importer import ModelImporter

from dive_utils import constants

from .crud_annotation import GroupItem, RevisionLogItem, TrackItem
from .event import send_new_user_email
from .views_annotation import AnnotationResource
from .views_configuration import ConfigurationResource
from .views_dataset import DatasetResource
from .views_metadata import DIVEMetadata
from .views_override import countJobs, use_private_queue
from .views_rpc import RpcResource

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
        # Setup route additions for exsting resources
        info['apiRoot'].job.route("GET", ("queued",), countJobs)
        info["apiRoot"].user.route("PUT", (":id", "use_private_queue"), use_private_queue)
        User().exposeFields(AccessType.READ, constants.UserPrivateQueueEnabledMarker)

        # Expose Job dataset association on the registered jobs model singleton.
        ModelImporter.model('job', 'jobs').exposeFields(
            AccessType.READ, constants.JOBCONST_DATASET_ID
        )

        DIVE_MAIL_TEMPLATES = Path(os.path.realpath(__file__)).parent / 'mail_templates'
        mail_utils.addTemplateDirectory(str(DIVE_MAIL_TEMPLATES))

        core_girder = info['serverRoot'].apps['']
        core_girder.script_name = '/girder'
        info['serverRoot'].mount(core_girder, '/girder', core_girder.config)
        del info['serverRoot'].apps['']

        dive_path = os.path.join('/opt/dive/src/dive_server/dive_client')
        conf = {
            '/': {
                'tools.staticfile.on': True,
                'tools.staticfile.filename': os.path.join(dive_path, 'index.html'),
            },
            '/static': {
                'tools.staticdir.on': True,
                'tools.staticdir.dir': dive_path,
            },
        }
        info['serverRoot'].mount(None, '/dive', conf)

        plugin_static_dir = Path(__file__).parent / 'web_client' / 'dist'
        plugin_assets = {
            'css': ['style.css'],
            'js': ['girder-plugin-dive.umd.cjs'],
        }
        if all((plugin_static_dir / filename).is_file() for filenames in plugin_assets.values() for filename in filenames):
            registerPluginStaticContent(
                plugin='dive',
                css=[f'/{filename}' for filename in plugin_assets['css']],
                js=[f'/{filename}' for filename in plugin_assets['js']],
                staticDir=plugin_static_dir,
                tree=info['serverRoot'],
            )
        else:
            logging.getLogger(__name__).warning(
                'DIVE Girder plugin web client is not built at %s; skipping static '
                'registration. Build it with `npm run build` in '
                'server/dive_server/web_client or rebuild the web image.',
                plugin_static_dir,
            )

        events.bind(
            'model.user.save.created',
            'send_new_user_email',
            send_new_user_email,
        )
