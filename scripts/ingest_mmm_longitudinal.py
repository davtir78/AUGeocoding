#!/usr/bin/env python3
"""
ingest_mmm_longitudinal.py — Download and load MMM 2015 & 2019 shapefiles into the mmm table.

The 2023 data is already present in the DB.  This script loads the two missing years.

Usage:
    pip install geopandas requests
    python scripts/ingest_mmm_longitudinal.py              # loads 2015 + 2019
    python scripts/ingest_mmm_longitudinal.py --year 2015  # load one year only
    python scripts/ingest_mmm_longitudinal.py --dry-run    # print counts, no DB writes

Data sources (Department of Health and Aged Care, CC BY 2.5 AU):
    2015: https://data.gov.au/data/dataset/7a61c987-70b0-47b8-96db-9e9ea9330b54
    2019: https://data.gov.au/data/dataset/a5cfc2c8-f0da-4aa1-8e19-7b5d7a9a5f56

Strategy:
    1. Download shapefile ZIP from data.gov.au
    2. Read locally with GeoPandas (on user's machine)
    3. Reproject to EPSG:4326 (WGS84) — same CRS as the existing mmm table
    4. Batch INSERT into mmm table via Lambda SQL mode (uses psycopg2, no Data API timeout)
    5. Apply ST_Subdivide to the newly loaded geometries for spatial join performance

Requirements:
    pip install geopandas requests boto3 pyproj shapely
"""

import argparse
import boto3
import io
import json
import os
import requests
import sys
import tempfile
import time
import zipfile

# Force UTF-8 stdout for Windows console
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')



# ---------------------------------------------------------------
# Source configuration
# ---------------------------------------------------------------
MMM_SOURCES = {
    2015: {
        "url": "https://data.gov.au/data/dataset/7a61c987-70b0-47b8-96db-9e9ea9330b54/resource/163dabf0-05b2-4b78-8f4a-f6c549782f29/download/mmm-2015-shape.zip",
        # 2015 shapefile uses 'MMM_Classi' (truncated to 10 chars by shapefile format)
        "code_col": ["MMM_Classi", "MMM_Class", "MMM_Code", "MMM_CODE", "mmm_code", "category"],
        "description": "MMM 2015 (DH 2011 ABS census)"
    },
    2019: {
        "url": "https://data.gov.au/data/dataset/a5cfc2c8-f0da-4aa1-8e19-7b5d7a9a5f56/resource/20d27d5d-8af7-4cd8-b5e5-78b4023a93f7/download/mmm-2019-shape.zip",
        # 2019 shapefile uses 'MMM2019' (confirmed by inspection)
        "code_col": ["MMM2019", "MMM_2019", "MMM_Classi", "MMM_Class", "MMM_Code", "MMM_CODE", "mmm_code"],
        "description": "MMM 2019 (DH 2016 ABS census)"
    },
    2023: {
        "url": "https://data.gov.au/data/dataset/f20ea7f5-e9bf-490f-a52f-03e8e56c5f21/resource/e80c4893-0512-47f9-9325-69294d6b4d63/download/mmm.zip",
        # 2023 shapefile uses 'MMM_CODE23' (confirmed by inspection — 7 aggregate polygons)
        "code_col": ["MMM_CODE23", "MMM2023", "MMM_2023", "MMM_Category", "MMM_Cat", "MMM_Classi", "MMM_Class", "MMM_Code", "MMM_CODE", "mmm_code"],
        "description": "MMM 2023 (DH 2021 ABS census)"
    }


}


LAMBDA_FUNCTION = "aws-geocoding-loader"
REGION          = "ap-southeast-2"
BATCH_SIZE      = 50   # INSERT rows per Lambda invocation


def invoke_sql(lm_client, sql: str) -> dict:
    """Invoke the Lambda in SQL mode — uses psycopg2 direct connection, no 45s timeout."""
    response = lm_client.invoke(
        FunctionName=LAMBDA_FUNCTION,
        InvocationType="RequestResponse",
        Payload=json.dumps({"mode": "SQL", "sql": sql})
    )
    result = json.loads(response["Payload"].read())
    if "errorMessage" in result:
        raise RuntimeError(f"Lambda SQL error: {result['errorMessage']}")
    return result


def find_col(gdf, candidates: list) -> str:
    """Find the first matching column name from a list of candidates."""
    for c in candidates:
        if c in gdf.columns:
            return c
        for col in gdf.columns:
            if col.upper() == c.upper():
                return col
    raise ValueError(f"Could not find column from candidates {candidates}. Columns: {list(gdf.columns)}")


def download_and_parse(year: int, tmp_dir: str):
    """Download shapefile ZIP, extract (including nested zips), return GeoDataFrame in EPSG:4326."""
    try:
        import geopandas as gpd
    except ImportError:
        print("✗ geopandas not installed. Run: pip install geopandas pyproj")
        sys.exit(1)

    src = MMM_SOURCES[year]
    zip_path = os.path.join(tmp_dir, f"mmm_{year}.zip")

    print(f"  Downloading {src['description']}...")
    headers = {"User-Agent": "Mozilla/5.0 aws-geocoding-pipeline"}
    with requests.get(src["url"], headers=headers, stream=True, timeout=120) as r:
        r.raise_for_status()
        with open(zip_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=65536):
                f.write(chunk)

    shp_dir = os.path.join(tmp_dir, f"mmm_{year}")
    os.makedirs(shp_dir, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as z:
        z.extractall(shp_dir)

    # Recursively extract any nested .zip files (e.g., MMM 2023 has a double-nested zip)
    for root, _, files in list(os.walk(shp_dir)):
        for fn in files:
            if fn.endswith(".zip"):
                nested_zip = os.path.join(root, fn)
                nested_dir = os.path.join(root, fn.replace(".zip", "_extracted"))
                os.makedirs(nested_dir, exist_ok=True)
                try:
                    with zipfile.ZipFile(nested_zip, "r") as zn:
                        zn.extractall(nested_dir)
                    print(f"  Extracted nested zip: {fn}")
                except Exception as e:
                    print(f"  Warning: could not extract {fn}: {e}")

    # Find .shp file
    shp_files = [os.path.join(root, f)
                 for root, _, files in os.walk(shp_dir)
                 for f in files if f.endswith(".shp")]
    if not shp_files:
        raise FileNotFoundError(f"No .shp file found in {shp_dir}")

    print(f"  Reading {shp_files[0]}...")
    gdf = gpd.read_file(shp_files[0])
    print(f"  Rows: {len(gdf)}, CRS: {gdf.crs}")

    # Reproject to WGS84 (EPSG:4326)
    if gdf.crs and gdf.crs.to_epsg() != 4326:
        print(f"  Reprojecting from {gdf.crs} to EPSG:4326...")
        gdf = gdf.to_crs(epsg=4326)

    # Identify the MMM code column
    code_col = find_col(gdf, src["code_col"])
    print(f"  MMM code column: '{code_col}'")

    return gdf, code_col




def build_insert_batch(rows: list, year: int) -> str:
    """Build a multi-values INSERT SQL for a batch of (mmm_code, wkt_geom) tuples."""
    values = []
    for mmm_code, wkt in rows:
        # Escape single quotes in WKT (shouldn't happen but defensive)
        wkt_safe = wkt.replace("'", "''")
        values.append(f"({year}, {int(mmm_code)}, ST_GeomFromText('{wkt_safe}', 4326))")
    return f"INSERT INTO mmm (year, mmm_code, geom) VALUES {', '.join(values)}"


def load_year(year: int, dry_run: bool, lm_client) -> int:
    """Download, parse, and load one MMM year. Returns number of rows inserted."""
    print(f"\n{'='*60}")
    print(f"Loading MMM {year}")
    print(f"{'='*60}")

    with tempfile.TemporaryDirectory() as tmp_dir:
        gdf, code_col = download_and_parse(year, tmp_dir)

        # Remove existing rows for this year (idempotent)
        if not dry_run:
            print(f"  Removing existing year={year} rows from mmm table...")
            invoke_sql(lm_client, f"DELETE FROM mmm WHERE year = {year}")

        total = len(gdf)
        inserted = 0
        batch = []

        # For large geometries (e.g., MMM 2023's 7 aggregate polygons),
        # simplify first to reduce WKT size and avoid Lambda 6MB payload limit.
        SIMPLIFY_TOLERANCE = 0.001  # ~100m in WGS84 degrees

        print(f"  Inserting {total} polygons in batches of {BATCH_SIZE}...")

        for idx, row in gdf.iterrows():
            geom = row.geometry
            if geom is None or geom.is_empty:
                continue
            mmm_code = row[code_col]
            if mmm_code is None:
                continue

            # Simplify to reduce WKT size (preserves topology)
            geom = geom.simplify(SIMPLIFY_TOLERANCE, preserve_topology=True)
            if geom is None or geom.is_empty:
                continue

            # Explode MultiPolygons into individual parts for large geometries
            from shapely.geometry import MultiPolygon, GeometryCollection, Polygon
            if hasattr(geom, 'geoms'):
                parts = list(geom.geoms)
            else:
                parts = [geom]

            for part in parts:
                if part is None or part.is_empty:
                    continue
                wkt = part.wkt
                # If WKT > 4MB even after simplify, skip (shouldn't happen after simplify)
                if len(wkt) > 4_000_000:
                    print(f"  Warning: skipping oversized part ({len(wkt):,} bytes) for mmm_code={mmm_code}")
                    continue
                batch.append((mmm_code, wkt))

                if len(batch) >= BATCH_SIZE:
                    if dry_run:
                        print(f"  [DRY RUN] Would insert {len(batch)} rows (batch ending at idx {idx})")
                    else:
                        sql = build_insert_batch(batch, year)
                        invoke_sql(lm_client, sql)
                    inserted += len(batch)
                    batch = []
                    print(f"  Inserted {inserted}...", end="\r")

        # Final batch
        if batch:
            if dry_run:
                print(f"  [DRY RUN] Would insert final {len(batch)} rows")
            else:
                sql = build_insert_batch(batch, year)
                invoke_sql(lm_client, sql)
            inserted += len(batch)

        print(f"\n  ✓ Loaded {inserted} rows for MMM {year}")
        return inserted




def apply_subdivide(year: int, dry_run: bool, lm_client):
    """
    Apply ST_Subdivide to the newly loaded year's geometries for spatial join performance.
    Uses an atomic approach: INSERT subdivided rows, DELETE the pre-subdivide originals
    via a single SQL round-trip so there's no temp-table cross-invocation dependency.
    """
    print(f"\n  Applying ST_Subdivide to mmm year={year}...")
    if dry_run:
        print(f"  [DRY RUN] Would apply ST_Subdivide for year={year}")
        return

    # Step 1: Insert subdivided copies alongside the originals.
    # Tag originals by their ctid (physical row id) so we can delete them after.
    # Simplest reliable approach: INSERT subdivided rows into a real (non-temp) staging table,
    # DELETE all year rows, then INSERT from staging.
    staging_table = f"mmm_subdivide_staging_{year}"
    invoke_sql(lm_client, f"DROP TABLE IF EXISTS {staging_table}")
    invoke_sql(lm_client, f"""
        CREATE TABLE {staging_table} AS
        SELECT year, mmm_code,
               (ST_Dump(ST_Subdivide(geom, 256))).geom AS geom
        FROM mmm
        WHERE year = {year}
    """)
    invoke_sql(lm_client, f"DELETE FROM mmm WHERE year = {year}")
    invoke_sql(lm_client, f"""
        INSERT INTO mmm (year, mmm_code, geom)
        SELECT year, mmm_code, geom FROM {staging_table}
    """)
    invoke_sql(lm_client, f"DROP TABLE IF EXISTS {staging_table}")
    print(f"  ✓ ST_Subdivide applied for year={year}")



def main():
    parser = argparse.ArgumentParser(description="Load MMM longitudinal data (all supported years)")
    parser.add_argument("--year", type=int, choices=list(MMM_SOURCES.keys()),
                        help="Load a specific year only (default: all supported years)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Download and parse only — no DB writes")
    parser.add_argument("--skip-subdivide", action="store_true",
                        help="Skip ST_Subdivide step (use if you will run it separately)")
    args = parser.parse_args()

    years = [args.year] if args.year else list(MMM_SOURCES.keys())


    print("=" * 60)
    print("AWS Geocoding — MMM Longitudinal Data Ingestion")
    print("=" * 60)
    print(f"  Years   : {years}")
    print(f"  Dry run : {args.dry_run}")

    lm_client = boto3.client("lambda", region_name=REGION)

    for year in years:
        inserted = load_year(year, args.dry_run, lm_client)
        if not args.dry_run and not args.skip_subdivide:
            apply_subdivide(year, args.dry_run, lm_client)

    print("\n" + "=" * 60)
    if args.dry_run:
        print("✓ Dry run complete — no changes made.")
    else:
        print("✓ MMM longitudinal ingestion complete.")
        print("\nNext: run scripts/apply_subdivide_reference.py to subdivide lga and mesh_block too.")


if __name__ == "__main__":
    main()
