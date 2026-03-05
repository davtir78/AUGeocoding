import os
import json
import boto3
import psycopg2
from config import DB_HOST, DB_NAME, REGION

def get_db_creds(secret_arn):
    if not secret_arn:
        # Fallback to env vars if no secret ARN (e.g. local dev)
        return {
            "username": os.environ.get('DB_USER'),
            "password": os.environ.get('DB_PASS'),
            "host": DB_HOST,
            "port": os.environ.get('DB_PORT', '5432'),
            "dbname": DB_NAME
        }
    secrets_client = boto3.client('secretsmanager', region_name=REGION)
    get_secret_value_response = secrets_client.get_secret_value(SecretId=secret_arn)
    return json.loads(get_secret_value_response['SecretString'])

def get_conn(creds):
    return psycopg2.connect(
        host=creds.get('host', DB_HOST),
        port=creds.get('port', 5432),
        user=creds['username'],
        password=creds['password'],
        dbname=creds.get('dbname', DB_NAME)
    )
