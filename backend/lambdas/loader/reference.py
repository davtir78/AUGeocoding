from config import logger
from db import get_conn

def handle_reference(mode, event, creds):
    if mode == 'REFRESH_MATVIEW':
        conn = get_conn(creds)
        conn.autocommit = True
        try:
            with conn.cursor() as cur:
                cur.execute("SET statement_timeout = 0")
                logger.info("Starting REFRESH MATERIALIZED VIEW CONCURRENTLY gnaf_export_view...")
                cur.execute("REFRESH MATERIALIZED VIEW CONCURRENTLY gnaf_export_view")
                cur.execute("SELECT COUNT(*) FROM gnaf_export_view")
                row_count = cur.fetchone()[0]
                logger.info(f"MATVIEW refreshed: {row_count:,} rows")
                return {"status": "SUCCESS", "message": "gnaf_export_view refreshed", "rows": row_count}
        finally:
            conn.close()

    elif mode == 'REFRESH_REFERENCE_DATA':
        expected_mmm_years = event.get('expected_mmm_years', [2015, 2019, 2023])
        conn = get_conn(creds)
        conn.autocommit = True
        try:
            with conn.cursor() as cur:
                results = {}
                for year in expected_mmm_years:
                    cur.execute("SELECT COUNT(*) FROM mmm WHERE year = %s", (year,))
                    count = cur.fetchone()[0]
                    results[f'mmm_{year}'] = count
                    if count == 0:
                        raise ValueError(
                            f"REFERENCE DATA MISSING: mmm year={year} has 0 rows. "
                            f"Run: python scripts/ingest_mmm_longitudinal.py --year {year}"
                        )
                
                cur.execute("SELECT COUNT(*) FROM lga")
                lga_count = cur.fetchone()[0]
                results['lga'] = lga_count
                if lga_count == 0:
                    raise ValueError("REFERENCE DATA MISSING: lga table is empty")

                cur.execute("SELECT COUNT(*) FROM mesh_block")
                mb_count = cur.fetchone()[0]
                results['mesh_block'] = mb_count
                if mb_count == 0:
                    raise ValueError("REFERENCE DATA MISSING: mesh_block table is empty")

                logger.info(f"Reference data validated: {results}")
                return {"status": "SUCCESS", "message": "Reference data validated", "counts": results}
        finally:
            conn.close()
    else:
        raise ValueError(f"Unknown reference mode: {mode}")
