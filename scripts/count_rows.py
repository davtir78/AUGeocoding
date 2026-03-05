import boto3
import json
import sys

def count_rows(table_name):
    client = boto3.client('lambda', region_name='ap-southeast-2')
    function_name = "aws-geocoding-loader"
    
    payload = {
        "mode": "SQL",
        "sql": f"SELECT COUNT(*) FROM {table_name};"
    }
    
    try:
        print(f"Counting rows in {table_name}...")
        response = client.invoke(
            FunctionName=function_name,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        
        response_payload = json.loads(response['Payload'].read())
        print(f"Response: {json.dumps(response_payload, indent=2)}")
        
    except Exception as e:
        print(f"Error invoking lambda: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 1:
        table = sys.argv[1]
    else:
        table = "gnaf"
    count_rows(table)
