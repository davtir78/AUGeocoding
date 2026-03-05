import json
import os
import requests
import boto3
from datetime import datetime

# Initialize DynamoDB client
dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('DATASET_STATE_TABLE', 'aws-geocoding-dataset-state')
table = dynamodb.Table(TABLE_NAME)

# Known Package IDs or Slugs
DATASET_CONFIG = {
    'MMM_2015': {'id': '7a61c987-70b0-47b8-96db-9e9ea9330b54', 'search': None},
    'MMM_2019': {'id': 'modified-monash-model-mmm-2019', 'search': None},
    'MMM_2023': {'id': 'f20ea7f5-e9bf-490f-a52f-03e8e56c5f21', 'search': None},
    'G-NAF': {'id': 'geocoded-national-address-file-g-naf', 'search': None},
    'LGA': {'id': None, 'search': 'Local Government Areas - Geoscape Administrative Boundaries'}
}

def search_package(query):
    headers = {'User-Agent': 'Mozilla/5.0'}
    SEARCH_URL = f"https://data.gov.au/api/3/action/package_search?q={query.replace(' ', '+')}"
    try:
        response = requests.get(SEARCH_URL, headers=headers, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                results = data['result']['results']
                # Try to find an exact match or best match
                sorted_packages = sorted(results, key=lambda x: x.get('metadata_modified', ''), reverse=True)
                if sorted_packages:
                    return sorted_packages[0]['id']
    except Exception as e:
        print(f"Package search failed for {query}: {e}")
    return None

def discover_version(package_id):
    headers = {'User-Agent': 'Mozilla/5.0'}
    CKAN_API_URL = f"https://data.gov.au/api/3/action/package_show?id={package_id}"
    try:
        response = requests.get(CKAN_API_URL, headers=headers, allow_redirects=True, timeout=10)
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                resources = data['result']['resources']
                # Filter for ZIP files
                zip_resources = [r for r in resources if r.get('format', '').lower() == 'zip']
                
                # Sort by last_modified to get the latest resource
                sorted_resources = sorted(zip_resources, key=lambda x: x.get('last_modified') or x.get('created') or '', reverse=True)
                
                if sorted_resources:
                    latest = sorted_resources[0]
                    return {
                        "version": latest.get('name') or latest.get('description') or package_id,
                        "url": latest.get('url'),
                        "released": latest.get('last_modified') or latest.get('created')
                    }
    except Exception as e:
        print(f"Discovery failed for {package_id}: {e}")
    return None

def lambda_handler(event, context):
    print("Received event:", json.dumps(event))
    dataset_key = event.get('dataset', 'G-NAF')
    
    config = DATASET_CONFIG.get(dataset_key)
    if not config:
        return {"error": f"Unknown dataset key: {dataset_key}"}

    # 1. Get Current State from DynamoDB
    try:
        response = table.get_item(Key={'DatasetName': dataset_key})
        current_state = response.get('Item', {})
        current_version = current_state.get('CurrentVersion')
    except Exception as e:
        print(f"Error fetching state: {e}")
        current_version = None

    # 2. Identify Package ID
    package_id = config['id']
    if not package_id and config['search']:
        package_id = search_package(config['search'])
    
    if not package_id:
        return {"error": f"Could not identify package for {dataset_key}"}

    # 3. Discover Latest Version
    latest_meta = discover_version(package_id)
    if not latest_meta:
        return {"error": f"Discovery failed for {dataset_key} (ID: {package_id})"}

    latest_version = latest_meta['version']
    update_available = (latest_version != current_version)

    # 4. Update DynamoDB with "LastCheck"
    try:
        table.put_item(Item={
            'DatasetName': dataset_key,
            'CurrentVersion': current_version,
            'LastCheck': datetime.now().isoformat(),
            'LatestAvailable': latest_version,
            'DownloadURL': latest_meta['url']
        })
    except Exception as e:
        print(f"Error updating state: {e}")

    return {
        "dataset": dataset_key,
        "update_available": update_available,
        "current_version": current_version,
        "latest_version": latest_version,
        "download_url": latest_meta['url']
    }
