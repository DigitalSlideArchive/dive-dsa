import click
import json

@click.command()
@click.argument('input_file', type=click.File('r'))
@click.argument('output_file', type=click.File('w'))
def convert_json_to_ndjson(input_file, output_file):
    """
    Convert a JSON file to an NDJSON file.
    """
    try:
        # Load JSON data
        data = json.load(input_file)
        
        # Write each JSON object as a line in the output file
        for obj in data:
            output_file.write(json.dumps(obj) + '\n')
            
        click.echo("Conversion completed successfully.")
    except json.JSONDecodeError as e:
        click.echo(f"Error: Failed to parse JSON from the input file. {e}")
        raise click.Abort()
    except Exception as e:
        click.echo(f"Error: {e}")
        raise click.Abort()

if __name__ == '__main__':
    convert_json_to_ndjson()
