import boto3
import json
import os

# Configuration from Terraform outputs
DB_CLUSTER_ARN = "arn:aws:rds:ap-southeast-2:657416661258:cluster:aws-geocoding-aurora-cluster"
DB_SECRET_ARN = "arn:aws:secretsmanager:ap-southeast-2:657416661258:secret:rds!cluster-01d7b821-b23e-4643-b2b1-b613931aeac0-RNtoZt"
DB_NAME = "geocoder"
REGION = "ap-southeast-2"

client = boto3.client('rds-data', region_name=REGION)

def test_connection():
    print(f"Testing connectivity to Aurora Data API...")
    print(f"Cluster ARN: {DB_CLUSTER_ARN}")
    
    try:
        response = client.execute_statement(
            resourceArn=DB_CLUSTER_ARN,
            secretArn=DB_SECRET_ARN,
            database=DB_NAME,
            sql="SELECT 1 as connected"
        )
        
        print("Response received:")
        print(json.dumps(response, indent=2, default=str))
        
        if response.get('records'):
            print("\nSUCCESS: Connection to Aurora Data API verified.")
        else:
            print("\nWARNING: Connection successful but no records returned.")
            
    except Exception as e:
        print(f"\nERROR: Failed to connect to Aurora Data API: {e}")

if __name__ == "__main__":
    test_connection()
