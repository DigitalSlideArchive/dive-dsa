# /// script
# requires-python = ">=3.13"
# dependencies = [
#     "click",
#     "faker",
# ]
# ///
import click
import json
import random
import string
import datetime
import os
from faker import Faker

fake = Faker()

# List of anatomy options
ANATOMY_OPTIONS = [
    "heart", "lungs", "liver", "kidney", "brain", "colon", "stomach", "pancreas", "spleen", "bladder"
]

# Function to generate a realistic filename based on patient ID
def generate_filename(patient_id):
    return f"{patient_id}_scan_{random.randint(1000, 9999)}.mp4"

# Function to generate a random path with city and hospital name
def generate_random_path(filename):
    city = fake.city()
    hospital = fake.company() + " Hospital"
    return f"{city}/{hospital}/{filename}"

# Function to generate a random patient name using Faker
def generate_patient_name():
    return fake.name()

# Function to generate a random patient ID
def generate_patient_id():
    return "P" + ''.join(random.choices(string.digits, k=6))

# Function to generate a random date
def generate_sample_date():
    start_date = datetime.date(2000, 1, 1)
    end_date = datetime.date.today()
    random_days = random.randint(0, (end_date - start_date).days)
    return (start_date + datetime.timedelta(days=random_days)).strftime("%Y-%m-%d")

# Function to generate a realistic height (inches) and weight (lbs)
def generate_height_weight():
    height = random.randint(58, 78)  # Height in inches (4'10" to 6'6")
    weight = random.randint(100, 250)  # Weight in lbs
    return height, weight

@click.command()
@click.argument('count', type=int)
@click.option('--output', default='output.ndjson', help='Output filename')
def generate_ndjson(count, output):
    "Generate an NDJSON file with random medical video metadata."
    data = []
    for _ in range(count):
        patient_id = generate_patient_id()
        filename = generate_filename(patient_id)
        height, weight = generate_height_weight()
        city = fake.city()
        state = fake.state_abbr()
        zip_code = fake.zipcode()
        entry = {
            "Filename": filename,
            "Key": generate_random_path(filename),
            "SampleDate": generate_sample_date(),
            "PatientName": generate_patient_name(),
            "Age": random.randint(1, 100),
            "PatientId": patient_id,
            "Anatomy": random.choice(ANATOMY_OPTIONS),
            "Height": height,
            "Weight": weight,
            "City": city,
            "State": state,
            "ZipCode": zip_code
        }
        data.append(entry)
    
    with open(output, "w") as f:
        for item in data:
            f.write(json.dumps(item) + "\n")
    
    click.echo(f"Generated {count} records in {output}")

if __name__ == "__main__":
    generate_ndjson()