#!/usr/bin/env python3
"""
verify_schema.py — Validates the Sprint 6 longitudinal schema is applied correctly.

Usage:
    python scripts/verify_schema.py

Checks:
  - gnaf: new longitudinal columns present, legacy columns absent
  - gnaf_virtual_parents: hierarchy_rank present, confidence absent
  - gnaf_export_view: materialized view exists with correct row count
  - gnaf_all: old standard view is gone
"""

import boto3
import subprocess
import sys
import os
import time

DATABASE = "geocoder"
REGION   = "ap-southeast-2"
CLUSTER_IDENTIFIER = "aws-geocoding-aurora-cluster"

PASS = "✓"
FAIL = "✗"


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


def query(client, cluster_arn, secret_arn, sql):
    response = client.execute_statement(
        resourceArn=cluster_arn,
        secretArn=secret_arn,
        database=DATABASE,
        sql=sql
    )
    return response.get("records", [])


def get_columns(client, cluster_arn, secret_arn, table_name):
    rows = query(client, cluster_arn, secret_arn,
        f"SELECT column_name FROM information_schema.columns "
        f"WHERE table_name = '{table_name}'"
    )
    return {r[0]["stringValue"] for r in rows}


def check(label, condition, detail=""):
    icon = PASS if condition else FAIL
    msg = f"  {icon} {label}"
    if detail:
        msg += f"  ({detail})"
    print(msg)
    return condition


def main():
    print("=" * 65)
    print("AWS Geocoding — Schema Verification (Sprint 6 Longitudinal)")
    print("=" * 65)

    secret_arn  = get_terraform_output("db_secret_arn")
    cluster_arn = get_cluster_arn()
    client = boto3.client("rds-data", region_name=REGION)

    all_ok = True

    # ---------------------------------------------------------------
    # 1. gnaf table — new columns present
    # ---------------------------------------------------------------
    print("\n[1] gnaf table — new longitudinal columns")
    gnaf_cols = get_columns(client, cluster_arn, secret_arn, "gnaf")

    required_new = {"hierarchy_rank", "mb_2016", "mb_2021", "mmm_2015", "mmm_2019", "mmm_2023"}
    for col in sorted(required_new):
        ok = check(f"gnaf.{col} exists", col in gnaf_cols)
        all_ok = all_ok and ok

    print("\n[2] gnaf table — legacy columns absent")
    legacy_cols = {"confidence", "mb_code", "sa2_name", "mmm_code"}
    for col in sorted(legacy_cols):
        ok = check(f"gnaf.{col} removed", col not in gnaf_cols)
        all_ok = all_ok and ok

    # ---------------------------------------------------------------
    # 2. gnaf_virtual_parents
    # ---------------------------------------------------------------
    print("\n[3] gnaf_virtual_parents")
    gvp_cols = get_columns(client, cluster_arn, secret_arn, "gnaf_virtual_parents")
    ok = check("gnaf_virtual_parents.hierarchy_rank exists", "hierarchy_rank" in gvp_cols)
    all_ok = all_ok and ok
    ok = check("gnaf_virtual_parents.confidence removed",   "confidence" not in gvp_cols)
    all_ok = all_ok and ok

    # ---------------------------------------------------------------
    # 3. gnaf_export_view materialized view
    # ---------------------------------------------------------------
    print("\n[4] gnaf_export_view materialized view")
    mv_rows = query(client, cluster_arn, secret_arn,
        "SELECT matviewname FROM pg_matviews WHERE matviewname = 'gnaf_export_view'"
    )
    ok = check("gnaf_export_view exists as MATERIALIZED VIEW", len(mv_rows) > 0)
    all_ok = all_ok and ok

    if ok:
        # Row count
        count_rows = query(client, cluster_arn, secret_arn,
            "SELECT COUNT(*) FROM gnaf_export_view"
        )
        count = int(count_rows[0][0]["longValue"])
        ok2 = check(
            f"gnaf_export_view has rows",
            count > 0,
            f"{count:,} rows"
        )
        all_ok = all_ok and ok2

        # Unique index
        idx_rows = query(client, cluster_arn, secret_arn,
            "SELECT indexname FROM pg_indexes WHERE tablename = 'gnaf_export_view' "
            "AND indexname = 'idx_gnaf_export_pid'"
        )
        ok3 = check("idx_gnaf_export_pid unique index exists", len(idx_rows) > 0)
        all_ok = all_ok and ok3

    # ---------------------------------------------------------------
    # 4. Old gnaf_all view is gone
    # ---------------------------------------------------------------
    print("\n[5] Legacy gnaf_all view")
    old_view = query(client, cluster_arn, secret_arn,
        "SELECT table_name FROM information_schema.views WHERE table_name = 'gnaf_all'"
    )
    ok = check("gnaf_all standard view is gone", len(old_view) == 0)
    all_ok = all_ok and ok

    # ---------------------------------------------------------------
    # Summary
    # ---------------------------------------------------------------
    print("\n" + "=" * 65)
    if all_ok:
        print("✓ All checks passed — schema is Sprint 6 ready.")
    else:
        print("✗ Some checks failed — run apply_migration.py and retry.")
        sys.exit(1)


if __name__ == "__main__":
    main()
