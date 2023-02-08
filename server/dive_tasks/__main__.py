import sys

from girder_worker.app import app


def main():
    """
    Because app overrides the broker configuration after our plugin
    is initialized, we have to override the module entrypoint
    and force our config to run last
    """
    app.worker_main(argv=['worker'] + sys.argv[1:] if 'worker' not in sys.argv else sys.argv)


if __name__ == '__main__':
    main()
