# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "click",
#     "faker",
#     "girder-client",
#     "setuptools",
# ]
# ///
"""Create a chain of nested Girder folders under a parent folder."""

import click
import girder_client
from faker import Faker

fake = Faker()


def login(host: str, port: int) -> girder_client.GirderClient:
    gc = girder_client.GirderClient(
        host, port=port, apiRoot="girder/api/v1", scheme="http"
    )
    gc.authenticate(interactive=True)
    return gc


def make_folder_name(length: int) -> str:
    """Generate a unique folder name of exactly ``length`` characters."""
    return fake.unique.pystr(min_chars=length, max_chars=length)


def create_nested_folders(
    gc: girder_client.GirderClient,
    parent_id: str,
    depth: int,
    name_length: int,
) -> list[tuple[str, str]]:
    """Create a single chain of nested folders to the given depth.

    Returns a list of (name, folder_id) for each created folder.
    """
    created: list[tuple[str, str]] = []
    current_parent = parent_id

    for level in range(1, depth + 1):
        name = make_folder_name(name_length)
        folder = gc.createFolder(parentId=current_parent, name=name, reuseExisting=False)
        folder_id = str(folder["_id"])
        created.append((name, folder_id))
        click.echo(f"  [{'/' * level}] {name} ({folder_id})")
        current_parent = folder_id

    return created


@click.command()
@click.argument("folder_id")
@click.option(
    "--depth",
    "-d",
    default=20,
    show_default=True,
    type=click.IntRange(1),
    help="Number of nested folder levels to create",
)
@click.option(
    "--name-length",
    "-n",
    default=8,
    show_default=True,
    type=click.IntRange(1),
    help="Character length of each generated folder name",
)
@click.option(
    "--host",
    default="127.0.0.1",
    show_default=True,
    help="Girder host",
)
@click.option(
    "--port",
    "-p",
    default=8010,
    show_default=True,
    type=int,
    help="Girder port",
)
def main(folder_id: str, depth: int, name_length: int, host: str, port: int) -> None:
    """Create nested folders under FOLDER_ID using Faker-generated names.

    Authenticates against Girder at HOST:PORT and creates a chain of
    DEPTH nested folders under the given parent folder.
    """
    click.echo(f"Connecting to http://{host}:{port}/girder/api/v1 ...")
    gc = login(host, port)

    parent = gc.getFolder(folder_id)
    click.echo(
        f"Creating {depth} nested folder(s) "
        f"(name length={name_length}) under "
        f"'{parent['name']}' ({folder_id})..."
    )

    created = create_nested_folders(gc, folder_id, depth, name_length)
    path = " / ".join(name for name, _ in created)
    click.echo(f"Done! Created chain: {path}")
    click.echo(f"Deepest folder id: {created[-1][1]}")


if __name__ == "__main__":
    main()
