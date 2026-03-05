import os
import json
import boto3
import urllib3
import logging

# Configure Logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Environment Variables
S3_BUCKET = os.environ.get('REF_BUCKET')
STATE_KEY = "metadata/last_gnaf_version.json"
DATASET_ID = "geoscape-geocoded-national-address-file-g-naf"
API_ENDPOINT = "https://data.gov.au/api/3/action/package_show"
INGESTION_SFN_ARN = os.environ.get('INGESTION_SFN_ARN')

s3 = boto3.client('s3')
sfn = boto3.client('stepfunctions')
http = urllib3.PoolManager()

def get_latest_gnaf_resource():
    url = f"{API_ENDPOINT}?id={DATASET_ID}"
    try:
        r = http.request('GET', url)
        if r.status != 200:
            logger.error(f"API request failed with status {r.status}")
            return None
        
        data = json.loads(r.data.decode('utf-8'))
        if not data.get('success'):
            return None

        resources = data['result']['resources']
        zip_resources = [
            r for r in resources 
            if r['format'].lower() == 'zip' or r['url'].endswith('.zip')
        ]
        
        if not zip_resources:
            return None

        # Sort by creation date (newest first)
        # ISO format strings (e.g. 2024-11-20T...) sort correctly as strings
        zip_resources.sort(
            key=lambda x: (x.get('created') or x.get('last_modified') or "1900-01-01"), 
            reverse=True
        )
        return zip_resources[0]
    except Exception as e:
        logger.error(f"Error fetching metadata: {e}")
        return None

def get_last_state():
    try:
        response = s3.get_object(Bucket=S3_BUCKET, Key=STATE_KEY)
        return json.loads(response['Body'].read().decode('utf-8'))
    except s3.exceptions.NoSuchKey:
        return {}
    except Exception as e:
        logger.error(f"Error reading state from S3: {e}")
        return {}

def save_state(state):
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=STATE_KEY,
        Body=json.dumps(state),
        ContentType='application/json'
    )

def handler(event, context):
    logger.info("Checking for G-NAF updates...")
    
    latest = get_latest_gnaf_resource()
    if not latest:
        return {"status": "ERROR", "message": "Could not retrieve dataset info"}

    resource_id = latest['id']
    resource_url = latest['url']
    resource_date = latest.get('created') or latest.get('last_modified')
    
    last_state = get_last_state()
    
    if last_state.get('resource_id') == resource_id:
        logger.info("Already have the latest version. Skipping.")
        return {"status": "SKIPPED", "message": "Up to date"}

    logger.info(f"New version detected: {latest['name']} ({resource_date})")
    
    # Trigger Step Function if ARN is provided
    if INGESTION_SFN_ARN:
        logger.info(f"Triggering Step Function: {INGESTION_SFN_ARN}")
        sfn.start_execution(
            stateMachineArn=INGESTION_SFN_ARN,
            input=json.dumps({
                "source_url": resource_url,
                "version": latest['name'],
                "resource_id": resource_id
            })
        )
    
    # Update State
    save_state({
        'resource_id': resource_id,
        'downloaded_at': resource_date,
        'url': resource_url,
        'name': latest['name']
    })
    
    return {
        "status": "SUCCESS",
        "new_version": latest['name']
    }
