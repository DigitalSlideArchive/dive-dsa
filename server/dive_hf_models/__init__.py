"""
Girder plugin that serves folders of the "DIVE HF Models" collection as
Hugging Face style model repositories for transformers.js in the browser.

Layout: ``<root collection>/<org>/<repo>/<files>``, served at
``/api/v1/dive_hf_models/<org>/<repo>/resolve/<revision>/<file path>``.
"""

from girder import plugin
from girder.exceptions import ValidationException
from girder.models.collection import Collection
from girder.utility import setting_utilities

from . import constants
from .source import normalize_model_source


@setting_utilities.validator(constants.ROOT_COLLECTION_SETTING)
def _validate_root_collection(doc):
    value = doc['value']
    if value in (None, ''):
        doc['value'] = None
        return
    if Collection().load(value, force=True, exc=False) is None:
        raise ValidationException('Model root must be an existing collection id.', 'value')
    doc['value'] = str(value)


@setting_utilities.validator(constants.MODEL_SOURCE_SETTING)
def _validate_model_source(doc):
    try:
        doc['value'] = normalize_model_source(doc['value'])
    except ValueError as err:
        raise ValidationException(str(err), 'value')


@setting_utilities.default(constants.MODEL_SOURCE_SETTING)
def _default_model_source():
    return dict(constants.DEFAULT_MODEL_SOURCE)


class GirderPlugin(plugin.GirderPlugin):
    DISPLAY_NAME = 'DIVE HF Models'

    def load(self, info):
        from .views import HFModelsResource

        info['apiRoot'].dive_hf_models = HFModelsResource('dive_hf_models')
