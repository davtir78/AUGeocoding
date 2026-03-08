import os
import json
import boto3

# Environment Variables
DB_SECRET_ARN = os.environ.get('DB_SECRET_ARN')
DB_CLUSTER_ARN = os.environ.get('DB_CLUSTER_ARN')
DB_HOST = os.environ.get('DB_HOST')
DB_NAME = os.environ.get('DB_NAME', 'geocoder')
REGION = os.environ.get('AWS_REGION', 'ap-southeast-2')
OPENSEARCH_ENDPOINT = os.environ.get('OPENSEARCH_ENDPOINT')

USE_DATA_API = os.environ.get('USE_DATA_API', 'true').lower() == 'true'

def get_db_creds(secret_arn):
    """Fetch credentials for psycopg2 (VPC) or return ARN for Data API (Zero-VPC)."""
    if USE_DATA_API:
        return {"secret_arn": secret_arn}
    
    secrets_client = boto3.client('secretsmanager', region_name=REGION)
    response = secrets_client.get_secret_value(SecretId=secret_arn)
    return json.loads(response['SecretString'])

class DataAPIWrapper:
    """Wrapper that mimics a psycopg2 connection/cursor using Aurora Data API."""
    def __init__(self, cluster_arn, secret_arn, database):
        self.rds_client = boto3.client('rds-data', region_name=REGION)
        self.cluster_arn = cluster_arn
        self.secret_arn = secret_arn
        self.database = database
        self.last_records = []
        self.rowcount = 0

    def cursor(self):
        return self

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        pass

    def close(self):
        pass

    def commit(self):
        pass

    def rollback(self):
        pass

    def execute(self, sql, params=None):
        parsed_params = []
        if params:
            for i, p in enumerate(params):
                name = f'p{i}'
                if isinstance(p, float):
                    parsed_params.append({'name': name, 'value': {'doubleValue': p}})
                elif isinstance(p, int):
                    parsed_params.append({'name': name, 'value': {'longValue': p}})
                elif p is None:
                    parsed_params.append({'name': name, 'value': {'isNull': True}})
                else:
                    parsed_params.append({'name': name, 'value': {'stringValue': str(p)}})
                sql = sql.replace('%s', f':{name}', 1)

        response = self.rds_client.execute_statement(
            resourceArn=self.cluster_arn,
            secretArn=self.secret_arn,
            database=self.database,
            sql=sql,
            parameters=parsed_params
        )
        self.last_records = response.get('records', [])
        self.rowcount = response.get('numberOfRecordsUpdated', 0)
        return response

    def fetchone(self):
        if not self.last_records:
            return None
        record = self.last_records.pop(0)
        return tuple(list(field.values())[0] if field else None for field in record)

    def fetchall(self):
        results = []
        while self.last_records:
            results.append(self.fetchone())
        return results

    def copy_expert(self, sql, stream):
        """
        Data API does NOT support COPY. 
        Falling back to batch inserts (slower but Zero-VPC compatible).
        """
        import csv
        import io
        
        # Extract table and columns from COPY command
        # e.g. "COPY gnaf (cols) FROM STDIN..."
        parts = sql.split()
        table_name = parts[1]
        
        # Simple CSV reader for the stream
        # Note: In a real app, we'd handle large files with chunking
        content = stream.read().decode('utf-8')
        reader = csv.DictReader(io.StringIO(content), delimiter='|')
        
        # We'll batch these in the calling code or here
        # For POC, we'll do 1000 at a time
        batch = []
        for row in reader:
            batch.append(row)
            if len(batch) >= 1000:
                self._flush_batch(table_name, batch)
                batch = []
        if batch:
            self._flush_batch(table_name, batch)

    def _flush_batch(self, table_name, batch):
        """Internal helper for batch insertion via Data API."""
        if not batch: return
        
        cols = list(batch[0].keys())
        placeholders = [f':{c}' for c in cols]
        sql = f"INSERT INTO {table_name} ({', '.join(cols)}) VALUES ({', '.join(placeholders)})"
        
        parameter_sets = []
        for row in batch:
            pset = []
            for k, v in row.items():
                if v == '' or v is None:
                    pset.append({'name': k, 'value': {'isNull': True}})
                else:
                    # Try to infer type
                    try:
                        if '.' in v:
                            pset.append({'name': k, 'value': {'doubleValue': float(v)}})
                        else:
                            pset.append({'name': k, 'value': {'longValue': int(v)}})
                    except ValueError:
                        pset.append({'name': k, 'value': {'stringValue': str(v)}})
            parameter_sets.append(pset)

        self.rds_client.batch_execute_statement(
            resourceArn=self.cluster_arn,
            secretArn=self.secret_arn,
            database=self.database,
            sql=sql,
            parameterSets=parameter_sets
        )
        self.rowcount += len(batch)

def get_conn(creds):
    if USE_DATA_API:
        return DataAPIWrapper(DB_CLUSTER_ARN, DB_SECRET_ARN, DB_NAME)
    
    import psycopg2
    try:
        return psycopg2.connect(
            host=DB_HOST,
            dbname=DB_NAME,
            user=creds['username'],
            password=creds['password'],
            connect_timeout=60
        )
    except psycopg2.OperationalError as e:
        print(f"Failed to connect to direct RDS cluster at {DB_HOST}: {e}")
        raise
