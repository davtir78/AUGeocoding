import boto3
import json

def list_columns():
    client = boto3.client('rds-data', region_name='ap-southeast-2')
    resource_arn = 'arn:aws:rds:ap-southeast-2:657416661258:cluster:aws-geocoding-aurora-cluster'
    secret_arn = 'arn:aws:secretsmanager:ap-southeast-2:657416661258:secret:rds!cluster-01d7b821-b23e-4643-b2b1-b613931aeac0-RNtoZt'
    database = 'geocoder'
    
    sql = "SELECT column_name FROM information_schema.columns WHERE table_name = 'gnaf' ORDER BY ordinal_position"
    
    try:
        response = client.execute_statement(
            resourceArn=resource_arn,
            secretArn=secret_arn,
            database=database,
            sql=sql
        )
        columns = [r[0]['stringValue'] for r in response['records']]
        print("GNAF Columns:")
        for col in columns:
            print(f"  - {col}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    list_columns()
