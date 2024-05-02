import json
import random
import click
from datetime import datetime
import re

# Categorical list of anatomies
anatomies = ['colon', 'lower intestine', 'upper intestine']

gastrointestinal_illnesses = [
    "Gastroesophageal reflux disease (GERD)",
    "Peptic ulcer disease",
    "Barrett's esophagus",
    "Esophageal cancer",
    "Gastritis",
    "Gastric ulcer",
    "Gastric cancer",
    "Helicobacter pylori infection",
    "Celiac disease",
    "Inflammatory bowel disease (Crohn's disease, ulcerative colitis)",
    "Colon polyps",
    "Colon cancer",
    "Diverticulosis",
    "Diverticulitis",
    "Hemorrhoids",
    "Anal fissures",
    "Malabsorption syndromes",
    "Small bowel tumors",
    "Small bowel obstruction",
    "Gastrointestinal bleeding",
    "Gastrointestinal motility disorders",
    "Gastroparesis",
    "Eosinophilic esophagitis",
    "Achalasia",
    "Zenker's diverticulum"
]

# Function to extract date from filename and convert to YYYY-MM-DD format
def extract_date(filename):
    try:
        # Regular expression pattern to match date in YYYY-MM-DD format
        date_pattern = r'\d{4}-\d{2}-\d{2}'
        
        # Search for date pattern in the filename
        match = re.search(date_pattern, filename)
        
        if match:
            # Extract matched date string
            date_str = match.group(0)
            
            # Parse date string and format to YYYY-MM-DD
            date = datetime.strptime(date_str, '%Y-%m-%d')
            return date.strftime('%Y-%m-%d')
        
        # If date pattern is not found, return None
        return None
    except IndexError:
        return None

def extract_date_alternate(filename):
    try:
        # Regular expression pattern to match date in DD-MMM-YYYY format
        date_pattern = r'\b(\d{1,2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{4})\b'
        
        # Search for date pattern in the filename
        match = re.search(date_pattern, filename)
        
        if match:
            # Extract matched date string
            day, month, year = match.groups()
            
            # Convert month abbreviation to month number
            month_num = {
                'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04',
                'May': '05', 'Jun': '06', 'Jul': '07', 'Aug': '08',
                'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
            }[month]
            
            # Format date as YYYY-MM-DD
            date_str = f'{year}-{month_num}-{day}'
            return date_str
        
        # If date pattern is not found, return None
        return None
    except IndexError:
        return None

# Function to randomly generate Severity (integer between 1 and 5)
def generate_severity():
    return random.randint(1, 5)

@click.command()
@click.argument('input_file', type=click.File('r'))
@click.argument('output_file', type=click.Path(), default='')
def process_jsonl(input_file, output_file):
    if not output_file:
        # If output file is not specified, generate default output file name
        input_filename = input_file.name
        output_file = input_filename.rsplit('.', 1)[0] + '_modified.ndjson'
    
    # Open the output file for writing
    with open(output_file, 'w') as output_file:
        # Read each line in the input file
        for line in input_file:
            # Parse the JSON object from the line
            data = json.loads(line)
            
            # Extract date from filename and add as a new key 'Date'
            date = extract_date(data['Filename'])
            if date:
                data['Date'] = date
            else:
                date = extract_date_alternate(data['Key'])
                if date:
                    data['Date'] = date
            
            # Generate Severity and add as a new key 'Severity'
            severity = generate_severity()
            data['Severity'] = severity
            
            # Randomly pick an Anatomy from the list and add as a new key 'Anatomy'
            anatomy = random.choice(anatomies)
            data['Anatomy'] = anatomy

            disorder = random.choice(gastrointestinal_illnesses)
            data['Disorder'] = disorder
            

            # Extract patient ID from 'Key' and add as a new key 'PatientID'
            patient_id = data['Key'].split('/')[-3]
            data['PatientID'] = patient_id
            
            # Write the updated JSON object to the output file
            output_file.write(json.dumps(data) + '\n')

    # Close the files
    input_file.close()

if __name__ == '__main__':
    process_jsonl()
