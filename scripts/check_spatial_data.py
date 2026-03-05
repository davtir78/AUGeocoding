import os
import boto3
import psycopg2
import json

def get_db_creds(secret_arn):
    client = boto3.client('secretsmanager', region_name='ap-southeast-2')
    response = client.get_secret_value(SecretId=secret_arn)
    return json.loads(response['SecretString'])

def check_spatial_data():
    secret_arn = os.environ.get('DB_SECRET_ARN')
    if not secret_arn:
        # Fallback for local dev if env var not set, though unsafe in prod
        print("DB_SECRET_ARN not set.")
        return

    creds = get_db_creds(secret_arn)
    conn = psycopg2.connect(
        host=os.environ.get('DB_HOST'),
        database=os.environ.get('DB_NAME', 'geocoder'),
        user=creds['username'],
        password=creds['password']
    )
    
    tables = ['lga', 'mesh_block', 'mmm']
    results = {}
    
    try:
        with conn.cursor() as cur:
            for table in tables:
                try:
                    cur.execute(f"SELECT COUNT(*) FROM {table}")
                    count = cur.fetchone()[0]
                    results[table] = count
                    print(f"[INFO] Table '{table}': {count} rows")
                except Exception as e:
                    print(f"[ERROR] Could not count {table}: {e}")
                    conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    check_spatial_data()
