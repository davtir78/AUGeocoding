import boto3
import sys
import json
from datetime import datetime

class DateTimeEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, datetime):
            return o.isoformat()
        return super(DateTimeEncoder, self).default(o)

def check_execution(execution_arn):
    client = boto3.client('stepfunctions', region_name='ap-southeast-2')
    
    print(f"Checking execution: {execution_arn}")
    try:
        response = client.describe_execution(executionArn=execution_arn)
        status = response['status']
        print(f"Status: {status}")
        
        if status == 'FAILED':
             print(f"Error: {response.get('error')}")
             print(f"Cause: {response.get('cause')}")
        
        print("\nLatest History Events:")
        history = client.get_execution_history(
            executionArn=execution_arn,
            reverseOrder=True,
            maxResults=50
        )
        for event in history['events']:
            print(f"{event['timestamp']} - {event['type']}")
            if 'stateEnteredEventDetails' in event:
                 print(f"  State: {event['stateEnteredEventDetails']['name']}")
            if 'executionFailedEventDetails' in event:
                 print(f"  Error: {event['executionFailedEventDetails']['error']}")
                 print(f"  Cause: {event['executionFailedEventDetails']['cause']}")
            if 'taskFailedEventDetails' in event:
                 print(f"  Error: {event['taskFailedEventDetails']['error']}")
                 print(f"  Cause: {event['taskFailedEventDetails']['cause']}")
                 
    except Exception as e:
        print(f"Error checking execution: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python check_execution.py <execution_arn>")
        sys.exit(1)
    check_execution(sys.argv[1])
