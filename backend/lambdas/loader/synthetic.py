from config import logger
from db import get_conn

def handle_synthetic(mode, event, creds):
    if mode == 'INJECT_SYNTHETIC_PARENTS':
        version = event.get('version')
        if not version: return {"status": "ERROR", "message": "version required"}
        
        conn = get_conn(creds)
        conn.autocommit = True
        try:
            with conn.cursor() as cur:
                logger.info(f"Cleaning up synthetic parents for version {version}")
                cur.execute("DELETE FROM gnaf_virtual_parents WHERE version = %s", (version,))
                
                logger.info(f"Injecting synthetic parents for version {version}")
                sql = """
                    INSERT INTO gnaf_virtual_parents (
                        gnaf_pid, address_string,
                        number_first, street_name, street_type, street_suffix,
                        locality, state, postcode,
                        longitude, latitude, geom,
                        version, is_synthetic, hierarchy_rank, child_count
                    )
                    SELECT
                        'SYNTH_' || MD5(
                            COALESCE(number_first,'') || '|' ||
                            COALESCE(street_name,'') || '|' ||
                            COALESCE(street_type,'') || '|' ||
                            COALESCE(locality,'') || '|' ||
                            COALESCE(postcode,'')
                        ) AS gnaf_pid,

                        TRIM(
                            COALESCE(number_first,'') || ' ' ||
                            COALESCE(street_name,'') || ' ' ||
                            COALESCE(street_type,'') || ' ' ||
                            COALESCE(locality,'') || ' ' ||
                            COALESCE(state,'') || ' ' ||
                            COALESCE(postcode,'')
                        ) AS address_string,

                        number_first,
                        street_name,
                        street_type,
                        MAX(street_suffix) AS street_suffix,
                        locality,
                        state,
                        postcode,

                        ST_X(ST_GeometricMedian(ST_Collect(geom))) AS longitude,
                        ST_Y(ST_GeometricMedian(ST_Collect(geom))) AS latitude,
                        ST_GeometricMedian(ST_Collect(geom)) AS geom,

                        %s AS version,
                        TRUE AS is_synthetic,
                        1 AS hierarchy_rank,
                        COUNT(*) AS child_count

                    FROM gnaf
                    WHERE
                        version = %s
                        AND (flat_number IS NOT NULL OR level_number IS NOT NULL)
                        AND NOT EXISTS (
                            SELECT 1 FROM gnaf AS base
                            WHERE base.number_first = gnaf.number_first
                              AND base.street_name = gnaf.street_name
                              AND base.locality = gnaf.locality
                              AND base.postcode = gnaf.postcode
                              AND base.flat_number IS NULL
                              AND base.level_number IS NULL
                              AND base.lot_number IS NULL
                              AND base.version = %s
                        )
                    GROUP BY
                        number_first, street_name, street_type,
                        locality, state, postcode
                    HAVING COUNT(*) >= 2;
                """
                cur.execute(sql, (version, version, version))
                count = cur.rowcount
                logger.info(f"Injected {count} synthetic parents")
                return {"status": "SUCCESS", "injected": count}
        finally:
            conn.close()
    elif mode == 'PRUNE_SYNTHETIC_PARENTS':
        conn = get_conn(creds)
        conn.autocommit = True
        try:
            with conn.cursor() as cur:
                logger.info("Pruning synthetic parents superseded by official records")
                sql = """
                    DELETE FROM gnaf_virtual_parents vp
                    USING gnaf base
                    WHERE base.number_first = vp.number_first
                      AND base.street_name = vp.street_name
                      AND COALESCE(base.street_type, '') = COALESCE(vp.street_type, '')
                      AND COALESCE(base.street_suffix, '') = COALESCE(vp.street_suffix, '')
                      AND base.locality = vp.locality
                      AND base.postcode = vp.postcode
                      AND base.flat_number IS NULL
                      AND base.level_number IS NULL
                      AND base.lot_number IS NULL
                      AND base.version = vp.version;
                """
                cur.execute(sql)
                count = cur.rowcount
                logger.info(f"Pruned {count} synthetic parents")
                return {"status": "SUCCESS", "pruned": count}
        finally:
            conn.close()
    else:
        raise ValueError(f"Unknown synthetic mode: {mode}")
