#!/usr/bin/env python3
"""
Index G-NAF data into OpenSearch for geocoding search.
Orchestrates the aws-geocoding-loader Lambda to perform bulk indexing in parallel.
"""
import boto3
import json
import time
import concurrent.futures
from concurrent.futures import ThreadPoolExecutor

# Configuration
REGION = "ap-southeast-2"
FUNCTION_NAME = "aws-geocoding-loader"
BATCH_SIZE = 500   # Reduced from 1000 to avoid 429 errors on t3.small
CONCURRENCY = 4    # Reduced from 30 to match t3.small CPU/Queue capacity

lambda_client = boto3.client('lambda', region_name=REGION)

def get_total_count():
    """Fetch total count of G-NAF records via Lambda."""
    print("Fetching total record count...")
    payload = {
        "mode": "SQL",
        "sql": "SELECT COUNT(*) FROM gnaf"
    }
    
    try:
        response = lambda_client.invoke(
            FunctionName=FUNCTION_NAME,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        payload_stream = response['Payload']
        response_payload = json.load(payload_stream)
        
        if 'errorMessage' in response_payload:
            raise Exception(f"Lambda Error: {response_payload['errorMessage']}")
            
        # SQL mode returns: {"results": [[count]], ...}
        count = int(response_payload['results'][0][0])
        print(f"Total G-NAF records: {count:,}")
        return count
    except Exception as e:
        print(f"Failed to get count: {str(e)}")
        raise

def invoke_indexing_batch(offset):
    """Invoke Lambda to index a batch of records."""
    payload = {
        "mode": "INDEX_OPENSEARCH",
        "create_index": False,
        "limit": BATCH_SIZE,
        "offset": offset
    }
    
    try:
        response = lambda_client.invoke(
            FunctionName=FUNCTION_NAME,
            InvocationType='RequestResponse',
            Payload=json.dumps(payload)
        )
        response_payload = json.load(response['Payload'])
        
        if 'errorMessage' in response_payload:
            return {"success": False, "offset": offset, "error": response_payload['errorMessage']}
            
        if response_payload.get('status') == 'SUCCESS':
            return {
                "success": True, 
                "offset": offset, 
                "indexed": response_payload.get('indexed', 0),
                "errors": response_payload.get('errors', False)
            }
        else:
            return {"success": False, "offset": offset, "error": f"Unknown status: {response_payload}"}
            
    except Exception as e:
        return {"success": False, "offset": offset, "error": str(e)}

def main():
    print("=" * 60)
    print("G-NAF OpenSearch Indexer (Lambda Orchestrator)")
    print("=" * 60)
    print(f"Batch Size: {BATCH_SIZE}")
    print(f"Concurrency: {CONCURRENCY}")
    
    try:
        total_count = get_total_count()
    except Exception:
        return

    # Generate offsets
    offsets = range(0, total_count, BATCH_SIZE)
    total_batches = len(offsets)
    
    print(f"Total Batches: {total_batches:,}")
    print("Starting indexing...")
    
    start_time = time.time()
    completed_batches = 0
    total_indexed = 0
    error_count = 0
    
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as executor:
        # Submit all tasks
        future_to_offset = {executor.submit(invoke_indexing_batch, offset): offset for offset in offsets}
        
        try:
            for future in concurrent.futures.as_completed(future_to_offset):
                offset = future_to_offset[future]
                try:
                    result = future.result()
                    if result['success']:
                        total_indexed += result['indexed']
                        if result['errors']:
                            print(f" [!] Batch offset {offset} had indexing errors")
                    else:
                        error_count += 1
                        print(f" [x] Failed batch offset {offset}: {result['error']}")
                except Exception as exc:
                    print(f" [x] Exception for batch offset {offset}: {exc}")
                    error_count += 1
                
                completed_batches += 1
                
                # Progress reporting every 0.1% or at least every 10 batches
                if completed_batches % max(10, total_batches // 1000) == 0:
                    elapsed = time.time() - start_time
                    rate = total_indexed / elapsed if elapsed > 0 else 0
                    percent = (completed_batches / total_batches) * 100
                    eta_seconds = (total_count - total_indexed) / rate if rate > 0 else 0
                    eta_min = eta_seconds / 60
                    
                    print(f"Progress: {percent:.1f}% ({total_indexed:,} records) | Rate: {rate:.0f} docs/sec | Errors: {error_count} | ETA: {eta_min:.1f} min")
                    
        except KeyboardInterrupt:
            print("\nStopping...")
            executor.shutdown(wait=False, cancel_futures=True)
            
    total_time = time.time() - start_time
    print("=" * 60)
    print(f"Indexing Complete in {total_time/60:.1f} minutes")
    print(f"Total Indexed: {total_indexed:,}")
    print(f"Total Errors (Batches): {error_count}")
    print("=" * 60)

if __name__ == "__main__":
    main()
