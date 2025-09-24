import re

SETTINGS_CONST_JOBS_CONFIGS = 'jobs_configs'
BRAND_DATA_CONFIG = 'brand_data_config'
SAM2_CONFIG = 'sam2_config'
DIVE_CONFIG = 'DIVE_CONFIG'
INSTALLED_ADDONS_CONFIGS = 'installed_addons'

ImageSequenceType = "image-sequence"
VideoType = "video"
DefaultVideoFPS = 10
JsonMetaCurrentVersion = 1
SettingsCurrentVersion = 1
AnnotationsCurrentVersion = 2

webValidImageFormats = {"png", "jpg", "jpeg"}
validImageFormats = {*webValidImageFormats, "tif", "tiff", "sgi", "bmp", "pgm"}
validVideoFormats = {
    "mp4",
    "webm",
    "avi",
    "mov",
    "wmv",
    "mpg",
    "mpeg",
    "mp2",
    "ogg",
    "flv",
}

videoRegex = re.compile(r"(\." + r"|\.".join(validVideoFormats) + ')$', re.IGNORECASE)
imageRegex = re.compile(r"(\." + r"|\.".join(validImageFormats) + ')$', re.IGNORECASE)
safeImageRegex = re.compile(r"(\." + r"|\.".join(webValidImageFormats) + ')$', re.IGNORECASE)
csvRegex = re.compile(r"\.csv$", re.IGNORECASE)
jsonRegex = re.compile(r"\.json$", re.IGNORECASE)
ndjsonRegex = re.compile(r"\.ndjson$", re.IGNORECASE)
ymlRegex = re.compile(r"\.ya?ml$", re.IGNORECASE)
zipRegex = re.compile(r"\.zip$", re.IGNORECASE)
metaRegex = re.compile(r"^.*\.?(meta|config)\.json$", re.IGNORECASE)

ImageMimeTypes = {
    "image/png",
    "image/jpeg",
    "image/tiff",
    "image/bmp",
    "image/x-portable-anymap",
    "image/x-portable-bitmap",
    "image/x-portable-graymap",
    "image/x-rgb",
}

VideoMimeTypes = {
    # web-safe
    "video/webm",
    "video/mp4",
    # avi
    "video/avi",
    "video/msvideo",
    "video/x-msvideo",
    "video/x-ms-wmv",
    # mov
    "video/quicktime",
    # mpeg
    "video/mpeg",
    "video/x-mpeg",
    "video/x-mpeq2a"
    # ogg
    "video/ogg",
    # flv
    "video/x-flv",
}

# Metadata markers
DatasetMarker = "annotate"
PublishedMarker = "published"
SharedMarker = "shared"
ProcessedMarker = "processed"
ForeignMediaIdMarker = "foreign_media_id"
TrainedPipelineMarker = "trained_pipeline"
TypeMarker = "type"
AssetstoreSourceMarker = "import_source"
AssetstoreSourcePathMarker = "import_path"
MarkForPostProcess = "MarkForPostProcess"
FPSMarker = "fps"
OriginalFPSMarker = "originalFps"
OriginalFPSStringMarker = "originalFpsString"
ConfidenceFiltersMarker = "confidenceFilters"
OverlayVideoFolderMarker = "overlayVideo"
OverlayVideoItemMarker = "overlayVideoItem"
OverlayMetadataMarker = "overlayMetadata"
DIVEMetadataMarker = "DIVEMetadata"
DIVEMetadataFilter = "DIVEMetadataFilter"
DIVEMetadataHistoryMarker = "DIVEMetadataHistory"
DIVEMetadataClonedFilter = "DIVEMetadataClonedFilter"
DIVEMetadataClonedFilterBase = "DIVEMetadataClonedFilterBase"
# Other constants
TrainedPipelineCategory = "trained"

# The name of the folder where any user specific data should be stored
# (created as a folder of that user)
ViameDataFolderName = "VIAME"
# The name of the subfolder for training results
TrainingOutputFolderName = "VIAME Training Results"
# The name of the source folder holding zip backups
SourceFolderName = "source"
# The name of the auxiliary folder
AuxiliaryFolderName = "auxiliary"
# the name of the meta file
MetaFileName = "meta.json"

# job constants
JOBCONST_DATASET_ID = 'dataset_id'
JOBCONST_PARAMS = 'params'
JOBCONST_PRIVATE_QUEUE = 'private_queue'
JOBCONST_CREATOR = 'creator'

# User queue constants
UserPrivateQueueEnabledMarker = 'user_private_queue_enabled'


AddonsListURL = 'https://github.com/VIAME/VIAME/raw/main/cmake/download_viame_addons.csv'
MASK_RLE_FILE_MARKER = 'RLE_MASK_FILE'
MASK_MARKER = 'mask'
MASK_TRACK_MARKER = 'mask_track'
MASK_TRACK_FRAME_MARKER = 'mask_track_frame'
MASK_FRAME_PARENT_TRACK_MARKER = 'mask_frame_parent_track'
MASK_FRAME_VALUE = 'mask_frame_value'


SAM2_MODEL_PATH = '/tmp/SAM2/models'
DEFAULT_SAM2_FILES = {
    "Tiny": {
        "config": "https://raw.githubusercontent.com/facebookresearch/sam2/main/sam2/configs/sam2.1/sam2.1_hiera_t.yaml",
        "checkpoint": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt",
    },
    "Small": {
        "config": "https://raw.githubusercontent.com/facebookresearch/sam2/main/sam2/configs/sam2.1/sam2.1_hiera_s.yaml",
        "checkpoint": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt",
    },
    "Base": {
        "config": "https://raw.githubusercontent.com/facebookresearch/sam2/main/sam2/configs/sam2.1/sam2.1_hiera_b+.yaml",
        "checkpoint": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_base_plus.pt",
    },
    "Large": {
        "config": "https://raw.githubusercontent.com/facebookresearch/sam2/main/sam2/configs/sam2.1/sam2.1_hiera_l.yaml",
        "checkpoint": "https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt",
    },
}

DEFAULT_SAM2_CONFIG = {
    "celeryQueue": 'dive_gpu',
    "models": DEFAULT_SAM2_FILES,
}
