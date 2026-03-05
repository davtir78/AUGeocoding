import boto3
import json
import sys

def test_dynamo():
    dynamodb = boto3.resource('dynamodb', region_name='ap-southeast-2')
    table = dynamodb.Table('aws-geocoding-pipeline-progress')
    
    print("Table Keys:")
    print(table.key_schema)
    sys.stdout.flush()
    
    print("\nAttempting put_item...")
    sys.stdout.flush()
    try:
        table.put_item(Item={'ExecutionId': 'CONFIG', 'StepName': 'SCHEDULE', 'test': 'value'})
        print("Put Success!")
    except Exception as e:
        print(f"Put Error: {e}")
    sys.stdout.flush()

    print("\nAttempting get_item...")
    sys.stdout.flush()
    try:
        response = table.get_item(Key={'ExecutionId': 'CONFIG', 'StepName': 'SCHEDULE'})
        print("Get Success!")
        print(response.get('Item'))
    except Exception as e:
        print(f"Get Error: {e}")
    print("DONE")
    sys.stdout.flush()

if __name__ == "__main__":
    test_dynamo()
