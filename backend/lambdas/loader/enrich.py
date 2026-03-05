from config import logger
from db import get_conn

def handle_enrich(mode, event, creds):
    if mode == 'PRE_ENRICH_SPATIAL':
        conn = get_conn(creds)
        conn.autocommit = True
        try:
            with conn.cursor() as cur:
                cur.execute("SET statement_timeout = 0")
                cur.execute("SET work_mem = '256MB'")

                logger.info("Enriching GNAF with LGA data (subdivided)...")
                cur.execute("""
                    UPDATE gnaf g
                    SET lga_code = l.lga_code,
                        lga_name = l.lga_name
                    FROM lga_subdivided l
                    WHERE g.geom IS NOT NULL
                      AND g.lga_code IS NULL
                      AND ST_Contains(l.geom, g.geom)
                """)
                logger.info(f"LGA enrichment: {cur.rowcount} rows updated")

                logger.info("Enriching GNAF with Mesh Block 2016 data (subdivided)...")
                cur.execute("""
                    UPDATE gnaf g
                    SET mb_2016 = m.mb_code
                    FROM mesh_block_subdivided m
                    WHERE g.geom IS NOT NULL
                      AND g.mb_2016 IS NULL
                      AND m.year = 2016
                      AND ST_Contains(m.geom, g.geom)
                """)
                logger.info(f"Mesh Block 2016 enrichment: {cur.rowcount} rows updated")

                logger.info("Enriching GNAF with Mesh Block 2021 data (subdivided)...")
                cur.execute("""
                    UPDATE gnaf g
                    SET mb_2021 = m.mb_code
                    FROM mesh_block_subdivided m
                    WHERE g.geom IS NOT NULL
                      AND g.mb_2021 IS NULL
                      AND m.year = 2021
                      AND ST_Contains(m.geom, g.geom)
                """)
                logger.info(f"Mesh Block 2021 enrichment: {cur.rowcount} rows updated")

                logger.info("Enriching GNAF with MMM 2015 data (subdivided)...")
                cur.execute("""
                    UPDATE gnaf g
                    SET mmm_2015 = m.mmm_code
                    FROM mmm_subdivided m
                    WHERE g.geom IS NOT NULL
                      AND g.mmm_2015 IS NULL
                      AND m.year = 2015
                      AND ST_Contains(m.geom, g.geom)
                """)
                logger.info(f"MMM 2015 enrichment: {cur.rowcount} rows updated")

                logger.info("Enriching GNAF with MMM 2019 data (subdivided)...")
                cur.execute("""
                    UPDATE gnaf g
                    SET mmm_2019 = m.mmm_code
                    FROM mmm_subdivided m
                    WHERE g.geom IS NOT NULL
                      AND g.mmm_2019 IS NULL
                      AND m.year = 2019
                      AND ST_Contains(m.geom, g.geom)
                """)
                logger.info(f"MMM 2019 enrichment: {cur.rowcount} rows updated")

                logger.info("Enriching GNAF with MMM 2023 (active) data (subdivided)...")
                cur.execute("""
                    UPDATE gnaf g
                    SET mmm_2023 = m.mmm_code
                    FROM mmm_subdivided m
                    WHERE g.geom IS NOT NULL
                      AND g.mmm_2023 IS NULL
                      AND m.year = 2023
                      AND ST_Contains(m.geom, g.geom)
                """)
                logger.info(f"MMM 2023 enrichment: {cur.rowcount} rows updated")

                return {"status": "SUCCESS", "message": "Spatial pre-enrichment complete (subdivided, optimized)"}
        finally:
            conn.close()
    else:
        raise ValueError(f"Unknown enrich mode: {mode}")
