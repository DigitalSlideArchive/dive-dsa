from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.api.rest import Resource
from girder.models.setting import Setting
from girder.models.token import Token
from girder.utility import setting_utilities
from girder_jobs.models.job import Job

from dive_server import crud
from dive_tasks.sam_tasks import download_sam_models
from dive_utils import constants, models


@setting_utilities.validator({constants.SAM2_CONFIG})
def validdateSAM2(doc):
    """Handle plugin-specific system settings. Right now we don't do any validation."""
    val = doc['value']
    if val is not None:
        crud.get_validated_model(models.SAM2Config, **val)


@setting_utilities.validator({constants.BRAND_DATA_CONFIG})
def validateBrandData(doc):
    val = doc['value']
    if val is not None:
        crud.get_validated_model(models.BrandData, **val)


@setting_utilities.validator({constants.DIVE_CONFIG})
def validateDIVEConfig(doc):
    val = doc['value']
    if val is not None:
        crud.get_validated_model(models.DIVESystemConfig, **val)


class ConfigurationResource(Resource):
    """Configuration resource handles get/set of global configuration"""

    def __init__(self, resourceName):
        super(ConfigurationResource, self).__init__()
        self.resourceName = resourceName

        self.route("GET", ("brand_data",), self.get_brand_data)
        self.route("PUT", ("brand_data",), self.update_brand_data)
        self.route("GET", ("sam2_configs",), self.get_sam2_configs)
        self.route("PUT", ("sam2_configs",), self.update_sam2_configs)
        self.route("GET", ("dive_config",), self.get_dive_config)
        self.route("PUT", ("dive_config",), self.update_dive_config)

    @access.public
    @autoDescribeRoute(Description("Get custom brand data"))
    def get_brand_data(self):
        return Setting().get(constants.BRAND_DATA_CONFIG) or {}

    @access.admin
    @autoDescribeRoute(
        Description("update brand data").jsonParam(
            "data", "Brand Data", paramType='body', requireObject=True, required=True
        )
    )
    def update_brand_data(self, data):
        Setting().set(constants.BRAND_DATA_CONFIG, data)

    @access.public
    @autoDescribeRoute(Description("Get custom brand data"))
    def get_sam2_configs(self):
        return Setting().get(constants.SAM2_CONFIG) or {}

    @access.admin
    @autoDescribeRoute(
        Description("update SAM2 Config")
        .jsonParam(
            "data",
            "SAM2 Data",
            paramType='body',
            requireObject=True,
            required=False,
            default=constants.DEFAULT_SAM2_CONFIG,
        )
        .param(
            "force",
            "Force re-download of all addons.",
            paramType="query",
            dataType="boolean",
            default=False,
            required=False,
        )
    )
    def update_sam2_configs(self, data, force):
        Setting().set(constants.SAM2_CONFIG, data)
        token = Token().createToken(user=self.getCurrentUser(), days=1)
        base_queue = data.get('celeryQueue', 'celery')
        base_config = Setting().get(constants.DIVE_CONFIG) or {}
        queues = ['celery']
        if base_queue != 'celery':
            queues.insert(0, base_queue)
        base_config["SAM2Config"] = {
            "queues": queues,
            "models": [],
        }
        base_config['celeryQueue'] = base_queue
        Setting().set(constants.DIVE_CONFIG, base_config)
        newjob = download_sam_models.apply_async(
            queue=base_queue,
            kwargs=dict(
                sam2_config=data['models'],
                force=force,
                girder_client_token=str(token["_id"]),
                girder_job_title=("Running SAM2 Model Downloading"),
                girder_job_type="SAM2",
            ),
        )
        Job().save(newjob.job)
        return newjob.job

    @access.public
    @autoDescribeRoute(Description("Get custom brand data"))
    def get_dive_config(self):
        return Setting().get(constants.DIVE_CONFIG) or {}

    @access.admin
    @autoDescribeRoute(
        Description("Update Base DIVE Config").jsonParam(
            "data", "DIVE CONFIG", paramType='body', requireObject=True, required=True
        )
    )
    def update_dive_config(self, data):
        base_config = Setting().get(constants.DIVE_CONFIG) or {}
        if data.get('SAM2Config', False):
            base_config['SAM2Config'] = data['SAM2Config']
        if data.get('EnabledFeatures', False):
            base_config['EnabledFeatures'] = data['EnabledFeatures']

        Setting().set(constants.DIVE_CONFIG, base_config)
