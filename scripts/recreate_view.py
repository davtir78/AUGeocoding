import boto3
import time
import sys

def recreate_view():
    client = boto3.client('rds-data', region_name='ap-southeast-2')
    resource_arn = 'arn:aws:rds:ap-southeast-2:657416661258:cluster:aws-geocoding-aurora-cluster'
    secret_arn = 'arn:aws:secretsmanager:ap-southeast-2:657416661258:secret:rds!cluster-01d7b821-b23e-4643-b2b1-b613931aeac0-RNtoZt'
    database = 'geocoder'
    
    with open('backend/sql/views.sql', 'r') as f:
        sql_content = f.read()
    
    # Split by semicolon and filter out empty strings
    statements = [s.strip() for s in sql_content.split(';') if s.strip()]

    print(f"Attempting to recreate view in {database} ({len(statements)} statements)...")
    max_retries = 10
    for i in range(max_retries):
        try:
            # Diagnostics
            user_res = client.execute_statement(resourceArn=resource_arn, secretArn=secret_arn, database=database, sql="SELECT current_user")
            print(f"Current User: {user_res['records'][0][0]['stringValue']}")
            
            path_res = client.execute_statement(resourceArn=resource_arn, secretArn=secret_arn, database=database, sql="SHOW search_path")
            print(f"Search Path: {path_res['records'][0][0]['stringValue']}")

            for sql in statements:
                print(f"Executing statement: {sql[:50]}...")
                client.execute_statement(
                    resourceArn=resource_arn,
                    secretArn=secret_arn,
                    database=database,
                    sql=sql
                )
            print("SUCCESS: View recreated successfully.")
            return True
        except Exception as e:
            print(f"Attempt {i+1} failed: {e}")
            if "Communications link failure" in str(e) or "server closed the connection" in str(e) or "ServiceUnavailable" in str(e) or "BadRequestException" in str(e):
                print("Database might be cold-starting. Waiting 30s...")
                time.sleep(30)
            else:
                print("Unexpected error. Still waiting 30s...")
                time.sleep(30)
    
    print("FAILED: Maximum retries reached.")
    return False

if __name__ == "__main__":
    if recreate_view():
        sys.exit(0)
    else:
        sys.exit(1)
