import sys
from unittest.mock import MagicMock, patch

# Mock AWS resources properly so imports work
mock_boto3 = MagicMock()
sys.modules['boto3'] = mock_boto3
sys.modules['boto3.dynamodb'] = MagicMock()
sys.modules['boto3.dynamodb.conditions'] = MagicMock()

from index import get_progress, parse_timestamp

# Configure logging
import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger()

def test_parse_timestamp():
    print("\nTesting parse_timestamp...")
    
    test_cases = [
        ("2026-02-19T10:00:00Z", "ISO with Z"),
        ("2026-02-19T10:00:00+00:00", "ISO with offset"),
        ("2026-02-19 10:00:00", "String format 1"),
        ("1708334400", "Unix timestamp"),
        ("invalid", "Invalid string"),
        (None, "None value")
    ]
    
    for ts, desc in test_cases:
        try:
            result = parse_timestamp(ts)
            print(f"✅ {desc}: {ts} -> {result}")
        except Exception as e:
            print(f"❌ {desc}: {ts} -> Error: {e}")

@patch('index.table')
def test_get_progress_error(mock_table):
    print("\nTesting get_progress with invalid timestamp...")
    
    # Mock DynamoDB response with invalid timestamp
    mock_table.scan.return_value = {
        'Items': [
            {
                'ExecutionId': 'test-exec-1',
                'StepName': 'PipelineStart',
                'status': 'IN_PROGRESS',
                'start_time': 'invalid-timestamp',
                'metadata': {'progress_percent': 50}
            }
        ]
    }
    
    event = {}
    response = get_progress(event)
    
    print(f"Response Status: {response['statusCode']}")
    print(f"Response Body: {response['body']}")
    
    if response['statusCode'] == 500:
        print("✅ Successfully reproduced 500 error")
    else:
        print("❌ Failed to reproduce 500 error")

if __name__ == '__main__':
    # Initial run to confirm failure
    try:
        test_get_progress_error()
    except Exception as e:
        print(f"Fatal error: {e}")
