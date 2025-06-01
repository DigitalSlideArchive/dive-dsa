from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.api.rest import Resource
from girder.models.setting import Setting
from girder.models.token import Token
from girder.utility import setting_utilities

from dive_server import crud
from dive_utils import constants, models
from dive_tasks.sam_tasks import download_sam_models


@setting_utilities.validator({constants.SAM2_CONFIG})
def validdateSAM2(doc):
    """Handle plugin-specific system settings. Right now we don't do any validation."""
    val = doc['value']
    if val is not None:
        for item in val.keys():
            crud.get_validated_model(models.SAM2Config, **val[item])


@setting_utilities.validator({constants.BRAND_DATA_CONFIG})
def validateBrandData(doc):
    val = doc['value']
    if val is not None:
        crud.get_validated_model(models.BrandData, **val)


class ConfigurationResource(Resource):
    """Configuration resource handles get/set of global configuration"""

    def __init__(self, resourceName):
        super(ConfigurationResource, self).__init__()
        self.resourceName = resourceName

        self.route("GET", ("brand_data",), self.get_brand_data)
        self.route("PUT", ("brand_data",), self.update_brand_data)
        self.route("GET", ("sam2_configs",), self.get_sam2_configs)
        self.route("PUT", ("sam2_configs",), self.update_sam2_configs)

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
            default=str(constants.DEFAULT_SAM2_FILES),
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
        download_sam_models.delay(
            sam2_config=data,
            force=force,
            girder_job_title="Upgrade Pipelines",
            girder_client_token=str(token["_id"]),
        )