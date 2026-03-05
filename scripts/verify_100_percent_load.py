import os
import subprocess
import boto3
from opensearchpy import OpenSearch, RequestsHttpConnection
from requests_aws4auth import AWS4Auth

REGION = "ap-southeast-2"
CLUSTER_IDENTIFIER = "aws-geocoding-aurora-cluster"
DATABASE = "geocoder"

def get_terraform_output(name: str) -> str:
    terraform_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "terraform")
    result = subprocess.run(
        f"terraform output -raw {name}",
        cwd=terraform_dir, shell=True, check=True,
        capture_output=True, text=True
    )
    return result.stdout.strip()

def get_cluster_arn() -> str:
    result = subprocess.run(
        f"aws rds describe-db-clusters "
        f"--db-cluster-identifier {CLUSTER_IDENTIFIER} "
        f"--query \"DBClusters[0].DBClusterArn\" --output text",
        shell=True, check=True, capture_output=True, text=True
    )
    return result.stdout.strip()

def check_postgres():
    print("Checking PostgreSQL Database...")
    secret_arn = get_terraform_output("db_secret_arn")
    cluster_arn = get_cluster_arn()
    client = boto3.client("rds-data", region_name=REGION)
    
    def query_count(sql):
        response = client.execute_statement(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            database=DATABASE,
            sql=sql
        )
        return response["records"][0][0]["longValue"]
    
    def query_rows(sql):
        response = client.execute_statement(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            database=DATABASE,
            sql=sql
        )
        return response.get("records", [])

    print("\n--- G-NAF Source Tables ---")
    tables = query_rows("SELECT table_schema, table_name FROM information_schema.tables WHERE table_name LIKE 'gnaf%' OR table_name LIKE 'address_detail%';")
    for r in tables:
        schema = r[0]["stringValue"]
        table = r[1]["stringValue"]
        print(f"  Found: {schema}.{table}")
        
    print("\n--- Materialized View `public.gnaf_all` Count ---")
    try:
        gnaf_all_count = query_count("SELECT COUNT(*) FROM public.gnaf_all;")
        print(f"- public.gnaf_all materialized view count: {gnaf_all_count:,}")
    except Exception as e:
        print(f"Failed to count public.gnaf_all: {e}")
    


def check_opensearch():
    print("\nChecking OpenSearch Index...")
    session = boto3.Session()
    credentials = session.get_credentials()
    region = session.region_name
    
    # Get OpenSearch endpoint from Terraform
    try:
        os_domain = get_terraform_output("opensearch_endpoint")
        print(f"  Found OpenSearch endpoint: {os_domain}")
    except Exception as e:
        print(f"Failed to get OpenSearch endpoint from Terraform: {e}")
        return

    awsauth = AWS4Auth(credentials.access_key, credentials.secret_key, region, 'es', session_token=credentials.token)
    
    os_client = OpenSearch(
        hosts=[{'host': os_domain, 'port': 443}],
        http_auth=awsauth,
        use_ssl=True,
        verify_certs=True,
        connection_class=RequestsHttpConnection,
        timeout=30
    )
    
    index_name = 'gnaf-address-index'
    try:
        count_response = os_client.count(index=index_name)
        count = count_response.get('count', 0)
        print(f"- {index_name} document count: {count:,}")
    except Exception as e:
        print(f"Error querying index: {e}")

if __name__ == '__main__':
    check_postgres()
    check_opensearch()
