import boto3
import json
import os

client = boto3.client('rds-data', region_name='ap-southeast-2')

# These would normally come from env or args
CLUSTER_ARN = "arn:aws:rds:ap-southeast-2:657416661258:cluster:aws-geocoding-aurora-cluster"
SECRET_ARN = "arn:aws:secretsmanager:ap-southeast-2:657416661258:secret:rds!cluster-01d7b821-b23e-4643-b2b1-b613931aeac0-RNtoZt"

def execute_statement(sql):
    response = client.execute_statement(
        secretArn=SECRET_ARN,
        database='geocoder',
        resourceArn=CLUSTER_ARN,
        sql=sql
    )
    return response

# Get tables
sql = "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name;"
res = execute_statement(sql)

print("Tables in public schema:")
for row in res['records']:
    print(f" - {row[0]['stringValue']}")
