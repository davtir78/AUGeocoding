import os
import sys
import boto3
import requests
import psycopg2
import transform_gnaf

def get_db_connection():
    """
    Establishes connection to Postgres using environment variables.
    Supports secrets manager fetching in future.
    """
    return psycopg2.connect(
        host=os.environ.get('DB_HOST'),
        database=os.environ.get('DB_NAME'),
        user=os.environ.get('DB_USER'),
        password=os.environ.get('DB_PASS')
    )

def download_file(url, local_path):
    """
    Downloads file from URL to local path with stream processing.
    """
    print(f"Downloading {url} to {local_path}...")
    with requests.get(url, stream=True) as r:
        r.raise_for_status()
        with open(local_path, 'wb') as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    print("Download complete.")

def ensure_table_exists(conn):
    """
    Ensures the 'gnaf' table exists with the correct schema compatible with transform_gnaf.py outputs.
    """
    create_sql = """
    CREATE TABLE IF NOT EXISTS gnaf (
        gnaf_pid TEXT PRIMARY KEY,
        address_string TEXT,
        version TEXT,
        building_name TEXT,
        lot_number TEXT,
        flat_number TEXT,
        level_number TEXT,
        number_first TEXT,
        number_last TEXT,
        street_name TEXT,
        street_type TEXT,
        street_suffix TEXT,
        locality TEXT,
        state TEXT,
        postcode TEXT,
        longitude NUMERIC,
        latitude NUMERIC,
        geom GEOMETRY(POINT, 4326)
    );
    """
    with conn.cursor() as cur:
        cur.execute(create_sql)
    conn.commit()

def load_to_postgres(filepath, table_name, conn):
    """
    Loads a CSV/PSV file into Postgres using COPY command.
    """
    print(f"Loading {filepath} into {table_name}...")
    with open(filepath, 'r') as f:
        with conn.cursor() as cur:
            # transform_gnaf.py output format:
            # Delimiter: '|', Header: True
            try:
                cur.copy_expert(f"COPY {table_name} FROM STDIN WITH (FORMAT csv, HEADER true, DELIMITER '|')", f)
                conn.commit()
                print(f"Successfully loaded {filepath}")
            except Exception as e:
                conn.rollback()
                print(f"Error loading {filepath}: {e}")
                raise

def main():
    # 1. Configuration
    download_url = os.environ.get('DOWNLOAD_URL')
    zip_path = os.environ.get('INPUT_ZIP_PATH', '/tmp/dataset.zip')
    output_dir = '/tmp/processed'
    
    # 2. Download (if applicable)
    if download_url:
        download_file(download_url, zip_path)
    elif not os.path.exists(zip_path):
        print(f"Error: No download URL and file not found at {zip_path}")
        # For local testing, we might want to skip download if testing transformation only
        # But generally this is a failure condition in production
        sys.exit(1)
        
    # 3. Transformation
    print("Starting G-NAF Transformation...")
    # Clean output dir if exists? or transform_gnaf handles it?
    # transform_gnaf.process_gnaf handles makedirs.
    transform_gnaf.process_gnaf(zip_path, output_dir)
    
    # 4. Database Loading
    print("Connecting to Database...")
    try:
        conn = get_db_connection()
        ensure_table_exists(conn)
        
        # Load all generated PSV files
        for filename in os.listdir(output_dir):
            if filename.endswith(".psv") or filename.endswith(".csv"):
                load_to_postgres(os.path.join(output_dir, filename), "gnaf", conn)
                
    except Exception as e:
        print(f"Critical Database Error: {e}")
        sys.exit(1)
    finally:
        if 'conn' in locals() and conn:
            conn.close()
            print("Database connection closed.")

if __name__ == "__main__":
    main()
