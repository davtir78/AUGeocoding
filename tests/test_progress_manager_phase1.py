import boto3
import json
import time

LAMBDA_NAME = "aws-geocoding-progress-manager"
lambda_client = boto3.client('lambda')

def invoke_lambda(payload):
    response = lambda_client.invoke(
        FunctionName=LAMBDA_NAME,
        InvocationType='RequestResponse',
        Payload=json.dumps(payload)
    )
    return json.loads(response['Payload'].read())

def print_result(name, result):
    # Print RAW result to see full error
    print(f"[{name}] Full Result:")
    print(json.dumps(result, indent=2))
    print("-" * 40)

def test_get_schedule():
    print("\n1. Testing GET /schedule...")
    payload = {
        "httpMethod": "GET",
        "path": "/schedule",
        "requestContext": {} 
    }
    result = invoke_lambda(payload)
    print_result("get_schedule", result)
    return result

def test_update_schedule():
    print("\n2. Testing POST /schedule (Update to Daily)...")
    body = {
        "frequency": "daily",
        "hour": 3,
        "minute": 30,
        "timezone": "Australia/Sydney"
    }
    payload = {
        "httpMethod": "POST",
        "path": "/schedule",
        "body": json.dumps(body),
        "requestContext": {}
    }
    result = invoke_lambda(payload)
    print_result("update_schedule", result)
    
    # Verify persistence
    print("   Verifying with GET /schedule...")
    get_res = invoke_lambda({
        "httpMethod": "GET", 
        "path": "/schedule",
        "requestContext": {}
    })
    print_result("verify_schedule", get_res)

def test_stop_execution():
    print("\n3. Testing POST /stop...")
    # Using a fake ARN (correct format, non-existent)
    fake_arn = "arn:aws:states:ap-southeast-2:123456789012:execution:aws-geocoding-orchestrator:fake-execution-id"
    body = {
        "executionArn": fake_arn
    }
    payload = {
        "httpMethod": "POST",
        "path": "/stop",
        "body": json.dumps(body),
        "requestContext": {}
    }
    # Expecting failure from SFN (AccessDenied or ExecutionDoesNotExist), but Lambda should handle it safely
    result = invoke_lambda(payload)
    print_result("stop_execution", result)

def test_run_update_and_get_progress():
    print("\n4. Testing Direct Invoke (run_update) & GET /progress...")
    exec_id = f"test-exec-{int(time.time())}"
    
    # 4a. Update Progress (IN_PROGRESS) - Direct invoke (no requestContext)
    payload_start = {
        "execution_id": exec_id,
        "step_name": "TestStep",
        "status": "IN_PROGRESS",
        "message": "Starting test step"
    }
    print(f"   Invoking run_update with {json.dumps(payload_start)}...")
    res1 = invoke_lambda(payload_start)
    print_result("run_update_start", res1)
    
    # 4b. Get Progress - API Gateway
    print("   Fetching progress...")
    payload_get = {
        "httpMethod": "GET",
        "path": "/progress", 
        "queryStringParameters": {"execution_id": exec_id},
        "requestContext": {}
    }
    res2 = invoke_lambda(payload_get)
    print_result("get_progress", res2)
    
    # 4c. Update Progress (COMPLETED) - Direct invoke
    payload_end = {
        "execution_id": exec_id,
        "step_name": "TestStep",
        "status": "COMPLETED",
        "message": "Finished test step"
    }
    print(f"   Invoking run_update with {json.dumps(payload_end)}...")
    res3 = invoke_lambda(payload_end)
    print_result("run_update_end", res3)

def test_trigger_refresh():
    print("\n5. Testing POST /refresh (Trigger Pipeline)...")
    payload = {
        "httpMethod": "POST",
        "path": "/refresh", # Any path not schedule/stop
        "body": "{}",
        "requestContext": {}
    }
    result = invoke_lambda(payload)
    print_result("trigger_refresh", result)

if __name__ == "__main__":
    test_get_schedule()
    test_update_schedule()
    test_stop_execution()
    test_run_update_and_get_progress()
    test_trigger_refresh()
