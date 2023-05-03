import json
import os
import click
import urllib.parse
import datetime
from random import randint

def readinput(file):
    with open(f'./{file}', 'r') as myfile:
        file_data = myfile.read()
        data = json.loads(file_data)
        return data
    return {}


@click.command(name="generate attention", help="Load in ")
@click.argument('input')
def load_data(input):
    data = readinput(input)
    tracks = data['tracks']
    # we get a random number every 100 frames
    base = randint(0, 100)
    count = 0
    for track in tracks.values():
        print(track)
        features = track['features']
        for feature in features:
            newrandom = base + randint(-5, 5)
            newrandom = max(newrandom, 0)
            newrandom = min(100, newrandom)
            feature['attributes']['ML_Value'] = newrandom
            if count % randint(40, 100) == 0:
                base = base + randint(-40, 40)
                base = max(base, 0)
                base = min(100, base)
            count += 1
    with open(os.path.basename(f'output.json'), "w") as outfile:
        outfile.write(json.dumps(data))

if __name__ == '__main__':
    load_data()
