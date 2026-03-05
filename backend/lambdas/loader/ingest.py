import os
import requests
from smart_open import open as smart_open

from config import logger
from db import get_conn
from utils import SamplerFile

def handle_ingestion(mode, event, creds):
    if mode == 'DOWNLOAD_FILE':
        url = event.get('url')
        bucket = event.get('s3_bucket')
        key = event.get('s3_key')
        
        if not url or not bucket or not key:
            raise ValueError("Missing url, s3_bucket, or s3_key for DOWNLOAD_FILE")
            
        logger.info(f"Downloading {url} to s3://{bucket}/{key}")
        headers = {'User-Agent': 'Mozilla/5.0'}
        try:
            with requests.get(url, headers=headers, stream=True) as r:
                r.raise_for_status()
                with smart_open(f"s3://{bucket}/{key}", 'wb') as fout:
                    for chunk in r.iter_content(chunk_size=8192):
                        fout.write(chunk)
            return {"status": "SUCCESS", "url": url, "destination": f"s3://{bucket}/{key}"}
        except Exception as e:
            logger.error(f"Download failed: {e}")
            raise

    elif mode == 'S3_INGESTION' or mode is None:
        bucket = event.get('s3_bucket')
        key = event.get('s3_key')
        table = event.get('table_name') or event.get('table')
        truncate = str(event.get('truncate', 'false')).lower() == 'true'
        
        if not bucket or not key or not table:
            raise ValueError("Missing s3_bucket, s3_key, or table_name for ingestion")

        test_mode_env = os.environ.get('TEST_MODE', 'false').lower() == 'true'
        test_mode_evt = str(event.get('test_mode', 'false')).lower() == 'true'
        test_mode = test_mode_env or test_mode_evt
        
        limit_percent_env = float(os.environ.get('LIMIT_PERCENT', '100'))
        limit_percent_evt = float(event.get('limit_percent', '100'))
        limit_percent = min(limit_percent_env, limit_percent_evt)

        s3_uri = f"s3://{bucket}/{key}"
        cols = ""
        if table == 'mmm': cols = "(year, mmm_code, geom)"
        elif table == 'gnaf': cols = "(gnaf_pid, primary_pid, primary_secondary, address_string, version, building_name, lot_number, flat_number, level_number, number_first, number_last, street_name, street_type, street_suffix, locality, state, postcode, longitude, latitude, geom)" 
        
        sql = f"COPY {table} {cols} FROM STDIN WITH (FORMAT csv, DELIMITER '|', HEADER true, QUOTE '\"')"
        logger.info(f"Ingesting {s3_uri} into {table} (Test Mode: {test_mode}, Limit: {limit_percent}%, Truncate: {truncate})")
        
        conn = get_conn(creds)
        try:
            with conn.cursor() as cur:
                cur.execute("SET statement_timeout = 0")
                if truncate:
                    logger.info(f"Truncating table {table} before load")
                    cur.execute(f"TRUNCATE {table}")
                    conn.commit()

            with smart_open(s3_uri, 'rb') as fin:
                stream = fin
                if test_mode and limit_percent < 100:
                    logger.info(f"Sampling {limit_percent}% of data from S3 stream")
                    stream = SamplerFile(fin, limit_percent / 100.0)
                
                with conn.cursor() as cur:
                    cur.copy_expert(sql, stream)
                    loaded_count = cur.rowcount
                    conn.commit()
            
            logger.info(f"Successfully loaded {loaded_count} rows into {table}")
            return {"status": "SUCCESS", "rows_loaded": loaded_count, "table": table}
        except Exception as e:
            logger.error(f"Ingestion failed: {e}")
            conn.rollback()
            raise
        finally:
            conn.close()
    
    else:
        raise ValueError(f"Unknown ingestion mode: {mode}")
