"""Settings and names used by the dive_hf_models plugin."""

# Setting: id of the Girder collection that holds "<org>/<repo>" model folders.
ROOT_COLLECTION_SETTING = 'dive_hf_models.root_collection'

# Collection created on first import when the setting is not set.
DEFAULT_COLLECTION_NAME = 'DIVE HF Models'
DEFAULT_COLLECTION_DESCRIPTION = (
    'Hugging Face style model repositories (<org>/<repo>/...) served to the browser '
    'by /api/v1/dive_hf_models/<org>/<repo>/resolve/<revision>/<file>. '
    'This collection is public so the system can read the models.'
)

# Folder metadata written on imported repository folders.
META_REPO_ID = 'hfRepoId'
META_REVISION = 'hfRevision'
META_SOURCE = 'hfSource'

# Suffix of the staging folder an import extracts into before swapping it in.
STAGING_SUFFIX = '.__importing__'

# Setting: where browsers load transformers.js models from.
MODEL_SOURCE_SETTING = 'dive_hf_models.model_source'
# auto: DIVE-DSA when it has the model, else the Hugging Face Hub.
# huggingface: always the Hub. local: only DIVE-DSA. custom: customHost.
MODEL_SOURCES = ('auto', 'huggingface', 'local', 'custom')
DEFAULT_MODEL_SOURCE = {'source': 'auto', 'customHost': None}
