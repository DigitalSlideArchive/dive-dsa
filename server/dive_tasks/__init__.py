import logging

from girder_worker import GirderWorkerPluginABC

__version__ = "1.0.0"

logging.basicConfig(format="%(levelname)s:%(message)s", level=logging.INFO)

try:
    from importlib.metadata import PackageNotFoundError, version as _importlib_version
except ImportError:
    from importlib_metadata import PackageNotFoundError, version as _importlib_version
try:
    __version__ = _importlib_version(__name__)
except PackageNotFoundError:
    # package is not installed
    pass


class DIVEPlugin(GirderWorkerPluginABC):
    def __init__(self, app, *args, **kwargs):
        self.app = app

    def task_imports(self):
        # Return a list of python importable paths to the
        # plugin's path directory
        return [
            "dive_tasks.tasks",
            "dive_tasks.dive_metadata_slicer_cli",
            "dive_tasks.sam_tasks",
            "dive_tasks.dive_batch_postprocess",
        ]
