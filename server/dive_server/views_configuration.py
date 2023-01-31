import csv
import os
from typing import Dict, List
from urllib.parse import urlparse

from girder.api import access
from girder.api.describe import Description, autoDescribeRoute
from girder.api.rest import Resource
from girder.models.setting import Setting
from girder.models.token import Token
from girder.utility import setting_utilities
import requests

from dive_server import crud, crud_rpc
from dive_tasks import tasks
from dive_utils import constants, models, types


@setting_utilities.validator({constants.SETTINGS_CONST_JOBS_CONFIGS})
def validateJobConfigs(doc):
    """Handle plugin-specific system settings. Right now we don't do any validation."""
    val = doc['value']
    if val is not None:
        # TODO: replace with real schema validation
        assert 'training' in val, '"training" missing from doc'
        assert 'pipelines' in val, '"piplines" missing from doc'


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
