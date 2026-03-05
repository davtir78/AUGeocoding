import os
import json
import argparse
import sys

from config import logger, DB_SECRET_ARN
from db import get_db_creds, get_conn

# Import handlers
from indexer import handle_indexer
from ingest import handle_ingestion
from synthetic import handle_synthetic
from enrich import handle_enrich
from reference import handle_reference
from transform import handle_transform

def run_loader(event):
    """Core logic shared between Lambda and CLI, acting as a dispatcher."""
    mode = event.get('mode')
    logger.info(f"Processing mode: {mode if mode else 'S3_INGESTION'}")
    
    # Skip DB creds for purely external operations
    if mode == 'DOWNLOAD_FILE' or mode == 'TRANSFORM_GNAF':
        creds = None
    else:
        creds = get_db_creds(DB_SECRET_ARN)
    
    # OPENSEARCH CORE MODES
    if mode in ['INDEX_OPENSEARCH', 'INDEX_SPECIFIC_PIDS', 'UPDATE_ALIAS', 'GET_INFO']:
        return handle_indexer(mode, event, creds)
        
    # INGESTION MODES
    elif mode in ['S3_INGESTION', 'DOWNLOAD_FILE', None]:
        return handle_ingestion(mode, event, creds)
        
    # SYNTHETIC INJECTION
    elif mode == 'INJECT_SYNTHETIC_PARENTS':
        return handle_synthetic(mode, event, creds)
        
    # PRE-ENRICHMENT
    elif mode == 'PRE_ENRICH_SPATIAL':
        return handle_enrich(mode, event, creds)
        
    # REFERENCE AND MATVIEW REFRESH
    elif mode in ['REFRESH_MATVIEW', 'REFRESH_REFERENCE_DATA']:
        return handle_reference(mode, event, creds)
        
    # TRANSFORM DATA
    elif mode == 'TRANSFORM_GNAF':
        return handle_transform(mode, event, creds)
        
    # POLL JOB
    elif mode == 'POLL_JOB':
        job_id = event.get('job_id')
        conn = get_conn(creds)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT job_id, task_name, status, progress, result FROM jobs WHERE job_id = %s", (job_id,))
                row = cur.fetchone()
                if row: return {"job_id": str(row[0]), "task_name": row[1], "status": row[2], "progress": row[3], "result": row[4]}
                return {"error": "Job not found"}
        finally:
            conn.close()

    elif mode == 'SQL':
        return {"status": "ERROR", "message": "SQL mode has been disabled for security. Use RDS Data API instead."}

    else:
        raise ValueError(f"Unknown mode: {mode}")

def handler(event, context):
    """Lambda Entry Point."""
    logger.info(f"Lambda invoked with event: {json.dumps(event)}")
    return run_loader(event)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="G-NAF Loader CLI")
    parser.add_argument("--mode", help="Workflow mode (INDEX_OPENSEARCH, S3_INGESTION, etc.)")
    parser.add_argument("--s3_bucket", help="S3 Bucket for ingestion")
    parser.add_argument("--s3_key", help="S3 object key")
    parser.add_argument("--output_key", help="S3 output object key (for transformations)")
    parser.add_argument("--table", "--table_name", dest="table_name", help="Database table name")
    parser.add_argument("--sql", help="SQL command to execute")
    parser.add_argument("--index_name", help="OpenSearch index name", default=os.environ.get('INDEX_NAME'))
    parser.add_argument("--create_index", action="store_true", help="Create index before loading")
    parser.add_argument("--iterate", action="store_true", help="Iterate through all pages in bulk indexing")
    parser.add_argument("--limit", type=int, default=1000, help="Bulk index limit")
    parser.add_argument("--offset", type=int, default=0, help="Bulk index offset")
    parser.add_argument("--test_mode", help="Enable test mode (sampling)")
    parser.add_argument("--limit_percent", help="Sampling percentage for test mode")
    parser.add_argument("--truncate", action="store_true", help="Truncate table before ingestion")
    
    args = parser.parse_args()
    
    # Map CLI args to event dict
    event = vars(args)
    # Remove None values
    event = {k: v for k, v in event.items() if v is not None}
    
    try:
        result = run_loader(event)
        print(json.dumps(result, indent=2))
    except Exception as e:
        logger.error(f"Fatal implementation error: {e}")
        sys.exit(1)
