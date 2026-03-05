#!/usr/bin/env python3
"""
Test RDS Data API connectivity
Usage: python scripts/test_rds_connectivity.py
"""

import boto3
import json
import time
from botocore.exceptions import ClientError

# Configuration
CLUSTER_ARN = "arn:aws:rds:ap-southeast-2:657416661258:cluster:aws-geocoding-aurora-cluster"
SECRET_ARN = "arn:aws:secretsmanager:ap-southeast-2:657416661258:secret:rds!cluster-01d7b821-b23e-4643-b2b1-b613931aeac0-RNtoZt"
DATABASE = "geocoder"
REGION = "ap-southeast-2"

def execute_sql(sql, description="SQL Query"):
    """Execute SQL via RDS Data API with timeout handling"""
    print(f"\n{description}")
    print(f"SQL: {sql[:100]}..." if len(sql) > 100 else f"SQL: {sql}")
    print("-" * 60)

    try:
        rds_data = boto3.client('rds-data', region_name=REGION)

        start_time = time.time()
        response = rds_data.execute_statement(
            resourceArn=CLUSTER_ARN,
            secretArn=SECRET_ARN,
            database=DATABASE,
            sql=sql
        )
        elapsed = time.time() - start_time

        print(f"✓ Query completed in {elapsed:.2f} seconds")
        print(f"Records returned: {len(response.get('records', []))}")

        if 'records' in response and response['records']:
            print("\nFirst few records:")
            for i, record in enumerate(response['records'][:5]):
                print(f"  {i+1}. {record}")
            if len(response['records']) > 5:
                print(f"  ... and {len(response['records']) - 5} more")

        return response

    except ClientError as e:
        elapsed = time.time() - start_time
        print(f"✗ Error after {elapsed:.2f} seconds: {e}")
        return None
    except Exception as e:
        elapsed = time.time() - start_time
        print(f"✗ Unexpected error after {elapsed:.2f} seconds: {e}")
        return None

def main():
    print("=" * 60)
    print("RDS Data API Connectivity Test")
    print("=" * 60)

    # Test 1: Simple query
    execute_sql(
        "SELECT 1 as test",
        "Test 1: Simple query (SELECT 1)"
    )

    # Test 2: Check gnaf table columns
    execute_sql(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'gnaf' ORDER BY ordinal_position",
        "Test 2: Check gnaf table columns"
    )

    # Test 3: Check if gnaf_all view exists
    execute_sql(
        "SELECT table_name, table_type FROM information_schema.tables WHERE table_name = 'gnaf_all'",
        "Test 3: Check if gnaf_all view exists"
    )

    # Test 4: Check gnaf_all view columns
    execute_sql(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'gnaf_all' ORDER BY ordinal_position",
        "Test 4: Check gnaf_all view columns"
    )

    # Test 5: Check for required columns in gnaf_all
    print("\nTest 5: Verify required columns in gnaf_all view")
    print("-" * 60)
    result = execute_sql(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'gnaf_all' AND column_name IN ('flat_number', 'level_number', 'lot_number')",
        "Checking for required columns"
    )

    if result and 'records' in result:
        required_columns = {record[0]['stringValue'] for record in result['records']}
        expected_columns = {'flat_number', 'level_number', 'lot_number'}

        if required_columns == expected_columns:
            print(f"✓ All required columns present: {expected_columns}")
        else:
            missing = expected_columns - required_columns
            if missing:
                print(f"✗ Missing required columns: {missing}")
            else:
                print(f"✓ All required columns present")

    print("\n" + "=" * 60)
    print("Connectivity tests complete.")
    print("=" * 60)

if __name__ == "__main__":
    main()
