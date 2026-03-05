#!/usr/bin/env python3
"""
Ingest ABS spatial boundary data (LGA, Mesh Block) into Aurora PostGIS.
Uses the aws-geocoding-loader Lambda's SQL mode for remote execution.

Geometry is simplified (0.001° ≈ 110m) to fit within Lambda's 6MB payload limit
while preserving sufficient accuracy for point-in-polygon lookups.

Usage:
    python scripts/ingest_spatial.py --lga
    python scripts/ingest_spatial.py --meshblock
    python scripts/ingest_spatial.py --all
    python scripts/ingest_spatial.py --verify
"""
import boto3
import json
import geopandas as gpd
import argparse
import time
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed

REGION = "ap-southeast-2"
FUNCTION_NAME = "aws-geocoding-loader"
# Simplification tolerance in degrees (~110m at equator, sufficient for stat lookups)
SIMPLIFY_TOLERANCE = 0.001
# Max payload size for Lambda (6MB) with safety margin
MAX_PAYLOAD_BYTES = 5_500_000

lambda_client = boto3.client('lambda', region_name=REGION)


def execute_sql(sql, label="SQL"):
    """Execute SQL via the Loader Lambda."""
    payload_str = json.dumps({"mode": "SQL", "sql": sql})
    payload_size = len(payload_str.encode('utf-8'))

    if payload_size > MAX_PAYLOAD_BYTES:
        print(f"  [WARN] {label}: payload {payload_size/1024:.0f}KB exceeds limit, skipping")
        return False

    try:
        resp = lambda_client.invoke(
            FunctionName=FUNCTION_NAME,
            InvocationType='RequestResponse',
            Payload=payload_str
        )
        result = json.loads(resp['Payload'].read())
        if 'errorMessage' in result:
            print(f"  [ERROR] {label}: {result['errorMessage'][:200]}")
            return False
        return result
    except Exception as e:
        print(f"  [ERROR] {label}: {e}")
        return False


def create_lga_table():
    """Create the LGA table in PostGIS."""
    print("Creating LGA table...")
    sql = """
    DROP TABLE IF EXISTS lga CASCADE;
    CREATE TABLE lga (
        id SERIAL PRIMARY KEY,
        lga_code VARCHAR(10),
        lga_name VARCHAR(100),
        state_code VARCHAR(3),
        state_name VARCHAR(50),
        area_sqkm NUMERIC(12,4),
        geom GEOMETRY(MultiPolygon, 4326)
    );
    """
    result = execute_sql(sql, "CREATE lga")
    if result:
        print("  LGA table created.")
    return result


def create_mesh_block_table():
    """Create the Mesh Block table in PostGIS."""
    print("Creating Mesh Block table...")
    sql = """
    DROP TABLE IF EXISTS mesh_block CASCADE;
    CREATE TABLE mesh_block (
        id SERIAL PRIMARY KEY,
        mb_code VARCHAR(15),
        mb_category VARCHAR(50),
        sa1_code VARCHAR(15),
        sa2_code VARCHAR(15),
        sa2_name VARCHAR(100),
        state_code VARCHAR(3),
        state_name VARCHAR(50),
        area_sqkm NUMERIC(12,4),
        year INTEGER,
        geom GEOMETRY(MultiPolygon, 4326)
    );
    """
    result = execute_sql(sql, "CREATE mesh_block")
    if result:
        print("  Mesh Block table created.")
    return result


def prepare_geometry(geom):
    """Simplify geometry and return WKT, handling None."""
    if geom is None:
        return None
    simplified = geom.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
    return simplified.wkt


def escape_sql(val):
    """Escape a value for SQL insertion."""
    if val is None:
        return "NULL"
    return "'" + str(val).replace("'", "''") + "'"


def insert_single_row(table, columns, values):
    """Insert a single row via SQL."""
    col_str = ', '.join(columns)
    val_parts = []
    for col, val in zip(columns, values):
        if col == 'geom':
            if val is None:
                val_parts.append("NULL")
            else:
                val_parts.append(f"ST_Multi(ST_Transform(ST_GeomFromText('{val}', 7844), 4326))")
        else:
            val_parts.append(escape_sql(val))
    val_str = ', '.join(val_parts)
    sql = f"INSERT INTO {table} ({col_str}) VALUES ({val_str});"
    return sql


def ingest_lga():
    """Ingest LGA shapefile into PostGIS using parallel threads."""
    print("\n=== Ingesting LGA 2025 ===")
    shp_path = "temp_data/lga/LGA_2025_AUST_GDA2020.shp"

    print(f"Reading {shp_path}...")
    gdf = gpd.read_file(shp_path)
    total = len(gdf)
    print(f"  {total} LGA records loaded.")

    create_lga_table()

    columns = ['lga_code', 'lga_name', 'state_code', 'state_name', 'area_sqkm', 'geom']
    inserted = 0
    errors = 0
    skipped = 0
    start_time = time.time()

    print(f"  Inserting with 12 parallel workers...")
    
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = []
        for i, (_, row) in enumerate(gdf.iterrows()):
            wkt = prepare_geometry(row.geometry)
            if wkt is None:
                skipped += 1
                continue

            values = [
                row['LGA_CODE25'], row['LGA_NAME25'],
                row['STE_CODE21'], row['STE_NAME21'],
                row['AREASQKM'], wkt
            ]
            sql = insert_single_row('lga', columns, values)
            futures.append(executor.submit(execute_sql, sql, f"LGA {row['LGA_NAME25']}"))

        for i, future in enumerate(as_completed(futures)):
            if future.result():
                inserted += 1
            else:
                errors += 1
            
            if (i + 1) % 50 == 0:
                elapsed = time.time() - start_time
                print(f"  Progress: {i+1}/{total} ({inserted} ok, {errors} err, {skipped} skip) | {elapsed:.0f}s")

    # Create GiST index
    print("  Creating GiST index on lga.geom...")
    execute_sql("CREATE INDEX idx_lga_geom ON lga USING GIST (geom);", "INDEX lga")

    elapsed = time.time() - start_time
    print(f"\n  LGA Complete: {inserted} inserted, {errors} errors, {skipped} skipped in {elapsed:.0f}s")
    return inserted



def ingest_lga():
    """Ingest LGA shapefile into PostGIS using parallel threads."""
    print("\n=== Ingesting LGA 2025 ===")
    shp_path = "temp_data/lga/LGA_2025_AUST_GDA2020.shp"

    print(f"Reading {shp_path}...")
    gdf = gpd.read_file(shp_path)
    total = len(gdf)
    print(f"  {total} LGA records loaded.")

    create_lga_table()

    columns = ['lga_code', 'lga_name', 'state_code', 'state_name', 'area_sqkm', 'geom']
    inserted = 0
    errors = 0
    skipped = 0
    start_time = time.time()

    print(f"  Inserting with 12 parallel workers...")
    
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = []
        for i, (_, row) in enumerate(gdf.iterrows()):
            wkt = prepare_geometry(row.geometry)
            if wkt is None:
                skipped += 1
                continue

            values = [
                row['LGA_CODE25'], row['LGA_NAME25'],
                row['STE_CODE21'], row['STE_NAME21'],
                row['AREASQKM'], wkt
            ]
            sql = insert_single_row('lga', columns, values)
            futures.append(executor.submit(execute_sql, sql, f"LGA {row['LGA_NAME25']}"))

        for i, future in enumerate(as_completed(futures)):
            if future.result():
                inserted += 1
            else:
                errors += 1
            
            if (i + 1) % 50 == 0:
                elapsed = time.time() - start_time
                print(f"  Progress: {i+1}/{total} ({inserted} ok, {errors} err, {skipped} skip) | {elapsed:.0f}s")

    # Create GiST index
    print("  Creating GiST index on lga.geom...")
    execute_sql("CREATE INDEX idx_lga_geom ON lga USING GIST (geom);", "INDEX lga")

    elapsed = time.time() - start_time
    print(f"\n  LGA Complete: {inserted} inserted, {errors} errors, {skipped} skipped in {elapsed:.0f}s")
    return inserted


def ingest_mesh_block():
    """Ingest Mesh Block shapefile into PostGIS using parallel batched inserts."""
    print("\n=== Ingesting Mesh Block 2021 ===")
    shp_path = "temp_data/mesh_block/MB_2021_AUST_GDA2020.shp"

    print(f"Reading {shp_path} (this may take a minute)...")
    gdf = gpd.read_file(shp_path)
    total = len(gdf)
    print(f"  {total:,} Mesh Block records loaded.")

    create_mesh_block_table()

    columns = ['mb_code', 'mb_category', 'sa1_code', 'sa2_code', 'sa2_name',
               'state_code', 'state_name', 'area_sqkm', 'year', 'geom']
    inserted = 0
    errors = 0
    start_time = time.time()
    
    # 2000 rows per batch (~4-5MB of simplified WKT) to fit Lambda 6MB payload limit
    BATCH_SIZE = 2000
    
    num_batches = (total + BATCH_SIZE - 1) // BATCH_SIZE
    print(f"  Processing in {num_batches} batches of {BATCH_SIZE} rows using 12 parallel workers...")
    
    with ThreadPoolExecutor(max_workers=12) as executor:
        futures = {}
        for i in range(0, total, BATCH_SIZE):
            batch = gdf.iloc[i : i + BATCH_SIZE]
            val_list = []
            
            for _, row in batch.iterrows():
                wkt = prepare_geometry(row.geometry)
                if wkt is None:
                    continue
                
                vals = [
                    row['MB_CODE21'], row['MB_CAT21'],
                    row['SA1_CODE21'], row['SA2_CODE21'], row['SA2_NAME21'],
                    row['STE_CODE21'], row['STE_NAME21'],
                    row['AREASQKM21'], 2021
                ]
                parts = [escape_sql(v) for v in vals]
                parts.append(f"ST_Multi(ST_Transform(ST_GeomFromText('{wkt}', 7844), 4326))")
                val_list.append(f"({', '.join(parts)})")
            
            if not val_list:
                continue
                
            col_str = ', '.join(columns)
            values_str = ', '.join(val_list)
            sql = f"INSERT INTO mesh_block ({col_str}) VALUES {values_str};"
            
            batch_num = (i // BATCH_SIZE) + 1
            future = executor.submit(execute_sql, sql, f"Batch {batch_num}/{num_batches}")
            futures[future] = len(val_list)

        count = 0
        for future in as_completed(futures):
            count += 1
            batch_inserted = futures[future]
            if future.result():
                inserted += batch_inserted
            else:
                errors += batch_inserted

            if count % 5 == 0 or count == num_batches:
                elapsed = time.time() - start_time
                rate = inserted / elapsed if elapsed > 0 else 0
                eta = (total - inserted) / rate / 60 if rate > 0 else 0
                print(f"  Progress: {inserted:,}/{total} | {rate:.0f} rows/sec | ETA: {eta:.1f}min")

    # Create GiST index
    print("  Creating GiST index on mesh_block.geom...")
    execute_sql("CREATE INDEX idx_mb_geom ON mesh_block USING GIST (geom);", "INDEX mesh_block")

    elapsed = time.time() - start_time
    print(f"\n  Mesh Block Complete: {inserted:,} inserted, {errors} errors in {elapsed/60:.1f} min")
    return inserted



def verify_counts():
    """Verify table row counts."""
    print("\n=== Verification ===")
    for table in ['lga', 'mesh_block', 'mmm']:
        result = execute_sql(f"SELECT COUNT(*) FROM {table}", f"COUNT {table}")
        if result and 'results' in result:
            count = result['results'][0][0]
            print(f"  {table}: {count:,} rows")
        else:
            print(f"  {table}: ??? (query failed or table missing)")


def main():
    parser = argparse.ArgumentParser(description="Ingest ABS spatial data into PostGIS")
    parser.add_argument('--lga', action='store_true', help='Ingest LGA 2025 boundaries')
    parser.add_argument('--meshblock', action='store_true', help='Ingest Mesh Block 2021 boundaries')
    parser.add_argument('--all', action='store_true', help='Ingest all spatial datasets')
    parser.add_argument('--verify', action='store_true', help='Verify table row counts only')
    args = parser.parse_args()

    if args.verify:
        verify_counts()
        return

    if not (args.lga or args.meshblock or args.all):
        parser.print_help()
        return

    print("=" * 60)
    print("ABS Spatial Data Ingestion -> Aurora PostGIS")
    print("=" * 60)
    print(f"Simplification tolerance: {SIMPLIFY_TOLERANCE} deg (~{SIMPLIFY_TOLERANCE*111:.0f}m)")

    if args.lga or args.all:
        ingest_lga()

    if args.meshblock or args.all:
        ingest_mesh_block()

    verify_counts()
    print("\nDone.")


if __name__ == "__main__":
    main()
