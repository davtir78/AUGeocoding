import boto3
import json
import psycopg2

def check_tables():
    region = 'ap-southeast-2'
    secret_arn = 'arn:aws:secretsmanager:ap-southeast-2:657416661258:secret:rds!cluster-01d7b821-b23e-4643-b2b1-b613931aeac0-RNtoZt'
    
    secrets_client = boto3.client('secretsmanager', region_name=region)
    get_secret_value_response = secrets_client.get_secret_value(SecretId=secret_arn)
    creds = json.loads(get_secret_value_response['SecretString'])
    
    print(f"Connecting to host: {creds['host']} as user: {creds['username']}")
    
    try:
        conn = psycopg2.connect(
            host=creds['host'],
            port=creds.get('port', 5432),
            user=creds['username'],
            password=creds['password'],
            dbname='geocoder'
        )
        with conn.cursor() as cur:
            cur.execute("SELECT table_name, table_schema FROM information_schema.tables WHERE table_name LIKE 'gnaf%'")
            rows = cur.fetchall()
            print("Tables found:")
            for row in rows:
                print(f"  - {row[1]}.{row[0]}")
            
            cur.execute("SHOW search_path")
            search_path = cur.fetchone()
            print(f"Current search_path: {search_path}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_tables()
