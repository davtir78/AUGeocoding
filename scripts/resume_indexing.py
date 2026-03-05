#!/usr/bin/env python3
"""
Resume the 100% pipeline from the OpenSearch indexing stage.
Windows-compatible version.
"""
import subprocess
import json
import sys
import os

CLUSTER = "aws-geocoding-cluster"
TASK_DEF = "aws-geocoding-loader:8"
# These should be confirmed or extracted dynamically
SUBNETS = "subnet-0c0266fe1a10ca40c,subnet-03994301df884c7e8"
SG = "sg-0b5e3d4fba5aa5451"
LOADER_LAMBDA = "aws-geocoding-loader"
INDEX_NAME = "feb-2026---geoscape-g-naf---gda94"
REGION = "ap-southeast-2"
TEMP_PAYLOAD = "c:/temp/payload.json"
TEMP_OUT = "c:/temp/lambda_out.json"

def run_aws_invoke(payload):
    """Run aws lambda invoke with a temporary payload file for Windows."""
    with open(TEMP_PAYLOAD, "w") as f:
        json.dump(payload, f)
    
    full_cmd = f"aws lambda invoke --function-name {LOADER_LAMBDA} --payload file://{TEMP_PAYLOAD} {TEMP_OUT} --region {REGION} --cli-binary-format raw-in-base64-out"
    print(f"  → {full_cmd}")
    result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ✗ Error: {result.stderr.strip()}")
        sys.exit(1)
        
    with open(TEMP_OUT, "r") as f:
        return json.load(f)

def run_aws_ecs(cmd):
    """Run an AWS CLI command for ECS and return parsed JSON output."""
    full_cmd = f"aws {cmd} --region {REGION} --output json"
    print(f"  → {full_cmd}")
    result = subprocess.run(full_cmd, shell=True, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  ✗ Error: {result.stderr.strip()}")
        sys.exit(1)
    return json.loads(result.stdout) if result.stdout.strip() else {}

def step1_create_index():
    print("\n[Step 1] Creating OpenSearch index...")
    payload = {
        "mode": "INDEX_OPENSEARCH",
        "create_index": True,
        "index_name": INDEX_NAME
    }
    run_aws_invoke(payload)
    print(f"  ✓ Index '{INDEX_NAME}' created (or already exists)")

def step2_bulk_index():
    print("\n[Step 2] Starting bulk indexing via ECS Fargate...")
    overrides = {
        "containerOverrides": [{
            "name": "loader",
            "command": ["--mode", "INDEX_OPENSEARCH", "--limit", "10000", "--iterate"],
            "environment": [
                {"name": "INDEX_NAME", "value": INDEX_NAME}
            ]
        }]
    }
    # For ECS run-task, we can pass overrides as JSON string, but we must escape it for the shell
    overrides_json = json.dumps(overrides).replace('"', '\\"')
    
    cmd = (
        f'ecs run-task --cluster {CLUSTER} --task-definition {TASK_DEF} '
        f'--launch-type FARGATE '
        f'--network-configuration "awsvpcConfiguration={{subnets=[{SUBNETS}],securityGroups=[{SG}],assignPublicIp=DISABLED}}" '
        f'--overrides "{overrides_json}"'
    )
    data = run_aws_ecs(cmd)
    task_arn = data["tasks"][0]["taskArn"]
    print(f"  ✓ Bulk indexing ECS task started: {task_arn.split('/')[-1]}")

def step3_update_alias():
    print("\n[Step 3] Updating OpenSearch alias...")
    payload = {
        "mode": "UPDATE_ALIAS",
        "index_name": INDEX_NAME,
        "alias_name": "gnaf"
    }
    run_aws_invoke(payload)
    print(f"  ✓ Alias 'gnaf' now points to '{INDEX_NAME}'")

if __name__ == "__main__":
    if not os.path.exists("c:/temp"):
        os.makedirs("c:/temp")
        
    print("=" * 60)
    print("Pipeline Recovery: OpenSearch Indexing (Windows fix)")
    print("=" * 60)
    
    if "--alias" in sys.argv:
        step3_update_alias()
    else:
        step1_create_index()
        step2_bulk_index()
        print(f"\nBulk indexing started. Wait ~45 mins, then run with --alias")
