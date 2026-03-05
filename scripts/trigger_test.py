import boto3
import argparse
import sys
import json
import time

# Configuration
LAMBDA_FUNCTION_NAME = 'aws-geocoding-loader'
ECS_TASK_FAMILY = 'aws-geocoding-loader'
STATE_MACHINE_ARN = 'arn:aws:states:ap-southeast-2:657416661258:stateMachine:aws-geocoding-orchestrator'
REGION = 'ap-southeast-2'

def trigger_pipeline(percent):
    client = boto3.client('stepfunctions', region_name=REGION)
    print(f"Starting execution of {STATE_MACHINE_ARN}...")
    
    # 100% means Production Mode (test_mode=false)
    # <100% means Test Mode (test_mode=true)
    test_mode = "true" if percent < 100 else "false"
    
    input_payload = {
        'trigger': 'manual_test',
        'test_mode': test_mode,
        'limit_percent': str(percent)
    }
    
    response = client.start_execution(
        stateMachineArn=STATE_MACHINE_ARN,
        input=json.dumps(input_payload)
    )
    print(f"Execution started: {response['executionArn']}")
    return response['executionArn']

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Trigger AWS Geocoding Pipeline Test")
    parser.add_argument('--percent', type=float, default=1.0, help="Percentage of data to process (e.g. 1.0, 5.0). Set to 100 for full run.")
    parser.add_argument('--reset', action='store_true', help="Reset to production mode (100%)")
    parser.add_argument('--yes', '-y', action='store_true', help="Skip confirmation prompt")
    
    args = parser.parse_args()
    
    if args.reset:
        percent = 100.0
    else:
        percent = args.percent
        
    mode_str = "TEST MODE" if percent < 100 else "PRODUCTION MODE"
    print(f"Configuring pipeline for {mode_str} ({percent}% data load)...")
    
    if args.yes:
        trigger_pipeline(percent)
    elif input("Trigger pipeline now? (y/n): ").lower() == 'y':
        trigger_pipeline(percent)
