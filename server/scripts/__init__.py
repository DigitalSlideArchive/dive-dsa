import click


@click.group()
@click.version_option(package_name='dive-dsa')
def cli():
    pass
