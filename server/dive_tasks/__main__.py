import sys

from girder_worker.app import app

# Import tasks to ensure they are registered
from dive_tasks import tasks  # noqa: F401

def main():
    """
    Because app overrides the broker configuration after our plugin
    is initialized, we have to override the module entrypoint
    and force our config to run last
    """
    argv = ['worker'] + sys.argv[1:] if 'worker' not in sys.argv else sys.argv
    app.worker_main(argv=argv)


if __name__ == '__main__':
    main()
