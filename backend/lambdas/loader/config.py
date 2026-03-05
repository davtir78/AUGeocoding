import os
import logging

# Configure Logging
logger = logging.getLogger()
for handler in logger.handlers:
    logger.removeHandler(handler)
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Environment Variables
DB_SECRET_ARN = os.environ.get('DB_SECRET_ARN')
DB_HOST = os.environ.get('DB_HOST') 
DB_NAME = os.environ.get('DB_NAME', 'geocoder')
REGION = os.environ.get('AWS_REGION', 'ap-southeast-2')
OPENSEARCH_ENDPOINT = os.environ.get('OPENSEARCH_ENDPOINT')
