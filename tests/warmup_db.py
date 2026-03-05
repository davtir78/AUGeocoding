import boto3
import json
import time

FUNCTION_NAME = "aws-geocoding-validator"
REGION = "ap-southeast-2"

# Scattered addresses across Australia to hit different polygons in the spatial tables
warmup_addresses = [
    "1 Martin Pl Sydney NSW 2000",
    "St Georges Tce Perth WA 6000",
    "Mitchell St Darwin NT 0800",
    "Collins St Melbourne VIC 3000",
    "Queen St Brisbane QLD 4000",
    "Franklin St Adelaide SA 5000",
    "Elizabeth St Hobart TAS 7000"
]

def warmup():
    lambda_client = boto3.client("lambda", region_name=REGION)
    print(f"Starting Database Warm-up (Aurora + OpenSearch)...")
    
    for i, address in enumerate(warmup_addresses):
        payload = {"body": json.dumps({"address": address})}
        
        start = time.time()
        try:
            print(f"[{i+1}/{len(warmup_addresses)}] Warming up with: {address}...", end="", flush=True)
            response = lambda_client.invoke(
                FunctionName=FUNCTION_NAME,
                InvocationType="RequestResponse",
                Payload=json.dumps(payload)
            )
            duration = time.time() - start
            print(f" Done ({duration:.2f}s)")
        except Exception as e:
            print(f" Failed: {e}")

if __name__ == "__main__":
    warmup()
    print("Warm-up complete. Aurora cluster and OpenSearch caches should be primed.")
