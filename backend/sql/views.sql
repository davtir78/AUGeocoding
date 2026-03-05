-- gnaf_export_view: The single source of truth for OpenSearch indexing.
-- Unions canonical gnaf records with synthetic virtual parents.
-- Stored as a MATERIALIZED VIEW to enable efficient cursor-based iteration
-- over 16.7M+ rows (WHERE gnaf_pid > :last_pid ORDER BY gnaf_pid LIMIT 5000).
--
-- REFRESH after pipeline pre-enrichment:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY gnaf_export_view;

DROP VIEW IF EXISTS gnaf_all CASCADE;
DROP MATERIALIZED VIEW IF EXISTS gnaf_export_view;

CREATE MATERIALIZED VIEW gnaf_export_view AS

SELECT
    g.gnaf_pid, g.primary_pid, g.primary_secondary,
    -- Join to get the primary address string, fallback to own address string if not found
    COALESCE(p.address_string, g.address_string) AS primary_address_string,
    g.address_string, g.number_first, g.number_last, g.street_name, g.street_type,
    g.street_suffix, g.locality, g.state, g.postcode, g.longitude, g.latitude, g.geom, g.version,
    g.flat_number, g.level_number, g.lot_number, g.building_name,
    CASE
        WHEN g.flat_number IS NULL AND g.level_number IS NULL AND g.lot_number IS NULL
        THEN TRUE ELSE FALSE
    END AS is_base_address,
    COALESCE(g.is_synthetic, FALSE) AS is_synthetic,
    COALESCE(g.hierarchy_rank,
        CASE
            WHEN g.flat_number IS NULL AND g.level_number IS NULL AND g.lot_number IS NULL
            THEN 2 ELSE 3
        END
    ) AS hierarchy_rank,
    g.lga_code, g.lga_name, g.mb_2016, g.mb_2021, g.mmm_2015, g.mmm_2019, g.mmm_2023
FROM gnaf g
LEFT JOIN gnaf p ON g.primary_pid = p.gnaf_pid

UNION ALL

SELECT
    gnaf_pid, NULL AS primary_pid, NULL AS primary_secondary,
    address_string AS primary_address_string,
    address_string, number_first, number_last, street_name, street_type,
    street_suffix, locality, state, postcode, longitude, latitude, geom, version,
    NULL AS flat_number, NULL AS level_number, NULL AS lot_number, NULL AS building_name,
    TRUE AS is_base_address, TRUE AS is_synthetic, 1 AS hierarchy_rank,
    NULL AS lga_code, NULL AS lga_name,
    NULL AS mb_2016, NULL AS mb_2021,
    NULL AS mmm_2015, NULL AS mmm_2019, NULL AS mmm_2023
FROM gnaf_virtual_parents;

CREATE UNIQUE INDEX idx_gnaf_export_pid ON gnaf_export_view (gnaf_pid);
