import os
import boto3
import json
import logging
import sys

# Add backend directory to path so we can import lambda code
# Configure local env based on AWS Geocoding Secrets
os.environ['DB_SECRET_ARN'] = 'arn:aws:secretsmanager:ap-southeast-2:657416661258:secret:rds!cluster-01d7b821-b23e-4643-b2b1-b613931aeac0-RNtoZt'
os.environ['DB_HOST'] = 'aws-geocoding-aurora.cluster-cty0sswe8s19.ap-southeast-2.rds.amazonaws.com'
os.environ['DB_NAME'] = 'geocoder'
os.environ['AWS_REGION'] = 'ap-southeast-2'
os.environ['OPENSEARCH_ENDPOINT'] = 'vpc-aws-geocoding-domain-oouigx52aeg4n4rsmqny6n7fyu.ap-southeast-2.es.amazonaws.com'
os.environ['PROGRESS_TABLE'] = 'aws-geocoding-pipeline-progress' # Use real table but we'll try to catch errors

# Add backend directory to path so we can import lambda code
lib_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend', 'lambdas'))
sys.path.append(lib_path)

try:
    from loader.index import handler
    print("Successfully imported handler from loader.index")
except ImportError as e:
    print(f"Import Error: {e}")
    sys.exit(1)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def test_indexing():
    """
    Simulates the Step Function payload triggering the INDEX_OPENSEARCH task.
    We inject a TEST_MODE flag to only process 10 records.
    """
    # Overwrite the indexing mode temporarily using a local test flag if index.py supports it
    # We will also pass a test flag into the event.
    
    event = {
        "mode": "INDEX_OPENSEARCH",
        "execution_id": "test_local_exec_123",
        "step_name": "Test_Index_OpenSearch",
        "limit": 10  # Passing custom flag that we will inject in index.py for fast fail
    }
    
    context = {}
    
    logger.info("Executing INDEX_OPENSEARCH locally...")
    result = handler(event, context)
    logger.info(f"Result: {json.dumps(result, indent=2)}")

if __name__ == "__main__":
    test_indexing()
