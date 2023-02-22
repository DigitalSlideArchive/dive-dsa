import logging
from girder_worker import GirderWorkerPluginABC

logging.basicConfig(format="%(levelname)s:%(message)s", level=logging.INFO)

try:
    from importlib.metadata import PackageNotFoundError
    from importlib.metadata import version as _importlib_version
except ImportError:
    from importlib_metadata import PackageNotFoundError
    from importlib_metadata import version as _importlib_version
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
        return ["dive_tasks.tasks"]
