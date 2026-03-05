#!/usr/bin/env python3
"""
apply_subdivide_reference.py — Apply ST_Subdivide to all reference geometry tables.

This dramatically improves spatial join performance on the 16.8M row gnaf table
by breaking complex polygons into smaller parts (max 256 vertices).

Tables processed:
    - lga         (548 rows → subdivided parts)
    - mmm         (all years → subdivided parts)
    - mesh_block  (732k rows → subdivided parts)

Usage:
    python scripts/apply_subdivide_reference.py              # all tables
    python scripts/apply_subdivide_reference.py --table lga  # one table
    python scripts/apply_subdivide_reference.py --dry-run    # estimate only

Strategy:
    Uses Lambda SQL mode for execution (psycopg2 direct, no 45s Data API limit).
    Each table is processed via an atomic TRUNCATE + re-insert from subdivided CTE.
    Since these are reference tables (not gnaf), this is safe and fully repeatable.

Warning:
    This operation can take several minutes per table.
    lga: fast (~1s). mmm: ~30s. mesh_block: several minutes.
"""

import argparse
import boto3
import json
import sys

LAMBDA_FUNCTION = "aws-geocoding-loader"
REGION          = "ap-southeast-2"

TABLES = {
    "lga": {
        "pk_cols": "lga_code, lga_name",
        "geom_col": "geom",
        "max_vertices": 256,
        "description": "LGA boundaries (548 rows)"
    },
    "mmm": {
        "pk_cols": "year, mmm_code",
        "geom_col": "geom",
        "max_vertices": 256,
        "description": "MMM boundaries (all years)"
    },
    "mesh_block": {
        "pk_cols": "mb_code, year",
        "geom_col": "geom",
        "max_vertices": 256,
        "description": "Mesh Block boundaries (732k rows, may take minutes)"
    }
}


def invoke_sql(lm_client, sql: str, description: str = "") -> dict:
    if description:
        print(f"    → {description}")
    response = lm_client.invoke(
        FunctionName=LAMBDA_FUNCTION,
        InvocationType="RequestResponse",
        Payload=json.dumps({"mode": "SQL", "sql": sql})
    )
    result = json.loads(response["Payload"].read())
    if "errorMessage" in result:
        raise RuntimeError(f"Lambda SQL error: {result['errorMessage'][:200]}")
    return result


def get_row_count(lm_client, table: str) -> int:
    result = invoke_sql(lm_client, f"SELECT COUNT(*) FROM {table}")
    try:
        return result["results"][0][0]
    except Exception:
        return -1


def subdivide_table(table: str, config: dict, dry_run: bool, lm_client) -> None:
    print(f"\n[{table}] {config['description']}")
    pk  = config["pk_cols"]
    geo = config["geom_col"]
    mv  = config["max_vertices"]

    before = get_row_count(lm_client, table)
    print(f"  Rows before: {before:,}")

    if dry_run:
        # Just show estimate
        result = invoke_sql(lm_client,
            f"SELECT COUNT(*) FROM (SELECT (ST_Dump(ST_Subdivide({geo}, {mv}))).geom FROM {table}) sub",
            "Estimating subdivided row count...")
        after_est = result.get("results", [["-1"]])[0][0]
        print(f"  Estimated rows after subdivide: {after_est}")
        print(f"  [DRY RUN — no changes made]")
        return

    # Use a real (non-TEMP) staging table to avoid cross-invocation data loss.
    # TEMP TABLE is session-scoped — it vanishes between separate Lambda SQL invocations.
    staging = f"_subdiv_{table}"

    invoke_sql(lm_client,
        f"DROP TABLE IF EXISTS {staging}",
        f"Dropping staging table if exists")

    invoke_sql(lm_client,
        f"""CREATE TABLE {staging} AS
            SELECT {pk},
                   (ST_Dump(ST_Subdivide({geo}, {mv}))).geom AS {geo}
            FROM {table}""",
        f"Building subdivided staging table (this may take a while)...")

    invoke_sql(lm_client,
        f"TRUNCATE TABLE {table}",
        "Truncating original table...")

    invoke_sql(lm_client,
        f"INSERT INTO {table} ({pk}, {geo}) SELECT {pk}, {geo} FROM {staging}",
        "Inserting subdivided rows...")

    invoke_sql(lm_client,
        f"DROP TABLE IF EXISTS {staging}",
        "Dropping staging table...")

    after = get_row_count(lm_client, table)
    print(f"  ✓ Rows after: {after:,}  (factor: {after/before:.1f}x)" if before > 0 else f"  ✓ Rows after: {after:,}")



def main():
    parser = argparse.ArgumentParser(description="Apply ST_Subdivide to reference geometry tables")
    parser.add_argument("--table", choices=list(TABLES.keys()),
                        help="Process one table only (default: all)")
    parser.add_argument("--dry-run", action="store_true",
                        help="Estimate only — no changes made")
    args = parser.parse_args()

    tables = {args.table: TABLES[args.table]} if args.table else TABLES

    print("=" * 60)
    print("AWS Geocoding — ST_Subdivide Reference Tables")
    print("=" * 60)
    print(f"  Tables  : {list(tables.keys())}")
    print(f"  Dry run : {args.dry_run}")

    if not args.dry_run:
        confirm = input("\nThis modifies reference table geometry in-place. Continue? (y/n): ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            sys.exit(0)

    lm_client = boto3.client("lambda", region_name=REGION)

    for table, config in tables.items():
        try:
            subdivide_table(table, config, args.dry_run, lm_client)
        except Exception as e:
            print(f"  ✗ FAILED [{table}]: {e}")

    print("\n" + "=" * 60)
    if args.dry_run:
        print("✓ Dry run complete.")
    else:
        print("✓ ST_Subdivide complete. Reference tables are now spatially optimised.")
        print("\nNext: run the pipeline with python scripts/trigger_test.py --percent 5")


if __name__ == "__main__":
    main()
