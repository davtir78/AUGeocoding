import json
import boto3
import time
from botocore.config import Config

# Increase timeout for potential slow queries
config = Config(
    read_timeout=120,
    connect_timeout=120,
    retries={'max_attempts': 0}
)

lambda_client = boto3.client('lambda', region_name='ap-southeast-2', config=config)

TEST_ADDRESSES = [
    "510 Little Collins St Melbourne VIC 3000",
    "123 Main St Hawthorn",
    "Sydney Opera House",
    "Level 5 100 St Georges Terrace Perth",
    "Lot 1 Oxford St Sydney"
]

def benchmark():
    print(f"{'Address':<50} | {'Status':<10} | {'Total Time (s)':<15} | {'Match'}")
    print("-" * 100)
    
    for address in TEST_ADDRESSES:
        payload = {"address": address}
        
        start_time = time.time()
        try:
            response = lambda_client.invoke(
                FunctionName='aws-geocoding-validator',
                InvocationType='RequestResponse',
                Payload=json.dumps(payload)
            )
            total_time = time.time() - start_time
            
            result = json.loads(response['Payload'].read().decode('utf-8'))
            status = result.get('statusCode', 'ERROR')
            
            if status == 200:
                body = json.loads(result['body'])
                matches = body.get('results', [])
                top_match = matches[0]['match'] if matches else "NO MATCH"
                print(f"{address[:50]:<50} | {status:<10} | {total_time:<15.4f} | {top_match}")
            else:
                print(f"{address[:50]:<50} | {status:<10} | {total_time:<15.4f} | N/A")
                
        except Exception as e:
            print(f"{address[:50]:<50} | ERROR      | {time.time() - start_time:<15.4f} | {str(e)}")

if __name__ == "__main__":
    benchmark()
