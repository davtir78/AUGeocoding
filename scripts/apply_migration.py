#!/usr/bin/env python3
"""
apply_migration.py — Run a SQL migration file against the Aurora cluster via RDS Data API.

Usage:
    python scripts/apply_migration.py                          # default: migrations/001_longitudinal_schema.sql
    python scripts/apply_migration.py --file backend/sql/migrations/001_longitudinal_schema.sql
    python scripts/apply_migration.py --dry-run               # print SQL only, do not execute

The script is idempotent: all DDL statements use IF EXISTS / IF NOT EXISTS guards.
It splits the SQL on statement boundaries (';') and executes each statement individually,
because the RDS Data API does not support multi-statement execution in a single call.

Note: The MATERIALIZED VIEW creation and CTAS patterns may take several minutes on the
      live 16.8M row gnaf table. This is expected — do not interrupt.
"""

import argparse
import boto3
import os
import subprocess
import sys
import time
from botocore.exceptions import ClientError

# ---------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------
DEFAULT_MIGRATION_FILE = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "backend", "sql", "migrations", "001_longitudinal_schema.sql"
)
DATABASE = "geocoder"
REGION   = "ap-southeast-2"
CLUSTER_IDENTIFIER = "aws-geocoding-aurora-cluster"


def get_terraform_output(name: str) -> str:
    """Fetch a value from terraform output."""
    terraform_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "terraform")
    try:
        result = subprocess.run(
            f"terraform output -raw {name}",
            cwd=terraform_dir, shell=True, check=True,
            capture_output=True, text=True
        )
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        print(f"  ✗ Could not get terraform output '{name}': {e.stderr.strip()}")
        sys.exit(1)


def get_cluster_arn() -> str:
    result = subprocess.run(
        f"aws rds describe-db-clusters "
        f"--db-cluster-identifier {CLUSTER_IDENTIFIER} "
        f"--query \"DBClusters[0].DBClusterArn\" --output text",
        shell=True, check=True, capture_output=True, text=True
    )
    return result.stdout.strip()


def split_statements(sql: str) -> list[str]:
    """
    Split SQL on semicolons, skipping blank statements and comments-only blocks.
    The RDS Data API requires one statement per call.
    """
    raw = sql.split(";")
    statements = []
    for stmt in raw:
        # Strip comments and whitespace to detect genuinely empty statements
        cleaned = "\n".join(
            line for line in stmt.splitlines()
            if not line.strip().startswith("--")
        ).strip()
        if cleaned:
            statements.append(stmt.strip())
    return statements


def execute_statement(client, cluster_arn: str, secret_arn: str, sql: str, dry_run: bool) -> bool:
    """
    Execute a single SQL statement with statement_timeout disabled.
    Uses begin/commit transaction so SET applies to the same session as the DDL.
    Returns True on success.
    """
    first_line = next((l.strip() for l in sql.splitlines() if l.strip() and not l.strip().startswith("--")), sql[:80])
    print(f"\n  → {first_line[:90]}{'...' if len(first_line) > 90 else ''}")

    if dry_run:
        print("    [DRY RUN — not executed]")
        return True

    try:
        start = time.time()

        # Open a transaction so SET statement_timeout applies to the DDL in same session
        tx = client.begin_transaction(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            database=DATABASE
        )
        tx_id = tx["transactionId"]

        # Disable statement timeout for long-running DDL (e.g. DROP COLUMN, CREATE MATVIEW)
        client.execute_statement(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            database=DATABASE,
            transactionId=tx_id,
            sql="SET statement_timeout = 0"
        )

        client.execute_statement(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            database=DATABASE,
            transactionId=tx_id,
            sql=sql
        )

        client.commit_transaction(
            resourceArn=cluster_arn,
            secretArn=secret_arn,
            transactionId=tx_id
        )

        elapsed = time.time() - start
        print(f"    ✓ OK ({elapsed:.1f}s)")
        return True

    except ClientError as e:
        print(f"    ✗ FAILED: {e.response['Error']['Message']}")
        # Attempt rollback
        try:
            client.rollback_transaction(
                resourceArn=cluster_arn,
                secretArn=secret_arn,
                transactionId=tx_id
            )
        except Exception:
            pass
        return False


def main():
    parser = argparse.ArgumentParser(description="Apply a SQL migration via RDS Data API")
    parser.add_argument(
        "--file", default=DEFAULT_MIGRATION_FILE,
        help="Path to the .sql migration file (default: 001_longitudinal_schema.sql)"
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Print what would be executed without running anything"
    )
    parser.add_argument(
        "--yes", "-y", action="store_true",
        help="Skip confirmation prompt"
    )
    args = parser.parse_args()

    migration_path = os.path.abspath(args.file)

    print("=" * 65)
    print("AWS Geocoding — SQL Migration Runner")
    print("=" * 65)
    print(f"  File    : {migration_path}")
    print(f"  Database: {DATABASE}")
    print(f"  Region  : {REGION}")
    print(f"  Dry run : {args.dry_run}")

    if not os.path.exists(migration_path):
        print(f"\n✗ Migration file not found: {migration_path}")
        sys.exit(1)

    with open(migration_path, "r", encoding="utf-8") as f:
        sql_content = f.read()

    statements = split_statements(sql_content)
    print(f"\n  Found {len(statements)} SQL statements to execute.")

    if not args.dry_run and not args.yes:
        confirm = input("\nApply migration now? (y/n): ").strip().lower()
        if confirm != "y":
            print("Aborted.")
            sys.exit(0)

    print("\n--- Resolving AWS resources ---")
    secret_arn  = get_terraform_output("db_secret_arn")
    cluster_arn = get_cluster_arn()
    print(f"  Cluster ARN : {cluster_arn}")
    print(f"  Secret ARN  : {secret_arn[:60]}...")

    client = boto3.client("rds-data", region_name=REGION)

    print("\n--- Executing statements ---")
    failures = []
    for i, stmt in enumerate(statements, 1):
        print(f"\n[{i}/{len(statements)}]", end="")
        ok = execute_statement(client, cluster_arn, secret_arn, stmt, args.dry_run)
        if not ok:
            failures.append((i, stmt[:120]))

    print("\n" + "=" * 65)
    if failures:
        print(f"✗ Migration completed with {len(failures)} failure(s):")
        for num, snippet in failures:
            print(f"  Statement {num}: {snippet}")
        sys.exit(1)
    else:
        if args.dry_run:
            print("✓ Dry run complete — no changes made.")
        else:
            print("✓ Migration applied successfully.")
            print("\nNext: run  python scripts/verify_schema.py  to confirm.")


if __name__ == "__main__":
    main()
