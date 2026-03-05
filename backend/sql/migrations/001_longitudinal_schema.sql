-- ================================================================
-- Migration 001: Longitudinal Schema (Sprint 6)
-- Date: 2026-02-22
-- Description: Replaces flat legacy columns (confidence, mb_code,
--              sa2_name, mmm_code) with the longitudinal multi-year
--              design and creates gnaf_export_view (Materialized View).
--
-- APPLY ORDER:
--   1. Run this script via psql or RDS Query Editor.
--   2. Verify with verify_schema.py before triggering the pipeline.
-- ================================================================

-- ----------------------------------------------------------------
-- Section 1: gnaf table — remove legacy columns, add longitudinal
-- ----------------------------------------------------------------

-- Remove old flat enrichment columns
ALTER TABLE gnaf DROP COLUMN IF EXISTS confidence;
ALTER TABLE gnaf DROP COLUMN IF EXISTS mb_code;
ALTER TABLE gnaf DROP COLUMN IF EXISTS sa2_name;
ALTER TABLE gnaf DROP COLUMN IF EXISTS mmm_code;

-- Add hierarchy rank (replaces confidence)
--   0 = unclassified, 1 = synthetic parent, 2 = base address, 3 = sub-dwelling
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS hierarchy_rank SMALLINT DEFAULT 0;

-- Add longitudinal Mesh Block IDs (sourced from G-NAF ZIP mapping files)
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS mb_2016 VARCHAR(15);
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS mb_2021 VARCHAR(15);

-- Add longitudinal Modified Monash Model codes (spatially enriched)
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS mmm_2015 INT;
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS mmm_2019 INT;
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS mmm_2023 INT;

-- ----------------------------------------------------------------
-- Section 2: gnaf_virtual_parents — replace confidence with hierarchy_rank
-- ----------------------------------------------------------------

ALTER TABLE gnaf_virtual_parents DROP COLUMN IF EXISTS confidence;
ALTER TABLE gnaf_virtual_parents ADD COLUMN IF NOT EXISTS hierarchy_rank SMALLINT DEFAULT 1;

-- ----------------------------------------------------------------
-- Section 3: mmm + mesh_block — ensure year column exists
--   (already present per schema.sql; idempotent)
-- ----------------------------------------------------------------

ALTER TABLE mmm ADD COLUMN IF NOT EXISTS year INT;
ALTER TABLE mesh_block ADD COLUMN IF NOT EXISTS year INT;

-- ----------------------------------------------------------------
-- Section 4: Replace standard view with Materialized View
--
-- gnaf_all (standard VIEW) → gnaf_export_view (MATERIALIZED VIEW)
--
-- A materialized view is required because cursor-based iteration
-- over a live UNION ALL view of 16.7M rows causes PostgreSQL to
-- re-evaluate the UNION on every page fetch — unacceptably slow.
-- The materialized version allows the cursor index to be used.
-- ----------------------------------------------------------------

-- Drop dependencies (cascade removes the old standard view)
DROP VIEW IF EXISTS gnaf_all CASCADE;
DROP MATERIALIZED VIEW IF EXISTS gnaf_export_view;

CREATE MATERIALIZED VIEW gnaf_export_view AS

-- Canonical G-NAF records
SELECT
    gnaf_pid,
    address_string,
    number_first,
    number_last,
    street_name,
    street_type,
    street_suffix,
    locality,
    state,
    postcode,
    longitude,
    latitude,
    geom,
    version,
    flat_number,
    level_number,
    lot_number,
    building_name,
    -- is_base_address: TRUE if no sub-dwelling identifiers are present
    CASE
        WHEN flat_number IS NULL AND level_number IS NULL AND lot_number IS NULL
        THEN TRUE ELSE FALSE
    END AS is_base_address,
    COALESCE(is_synthetic, FALSE) AS is_synthetic,
    -- hierarchy_rank: fallback to computed value if not explicitly set
    --   2 = base address (principal), 3 = sub-dwelling (unit/flat)
    COALESCE(hierarchy_rank,
        CASE
            WHEN flat_number IS NULL AND level_number IS NULL AND lot_number IS NULL
            THEN 2 ELSE 3
        END
    ) AS hierarchy_rank,
    lga_code,
    lga_name,
    mb_2016,
    mb_2021,
    mmm_2015,
    mmm_2019,
    mmm_2023

FROM gnaf

UNION ALL

-- Synthetic parent records (Scenario A — no real principal exists)
SELECT
    gnaf_pid,
    address_string,
    number_first,
    number_last,
    street_name,
    street_type,
    street_suffix,
    locality,
    state,
    postcode,
    longitude,
    latitude,
    geom,
    version,
    NULL AS flat_number,
    NULL AS level_number,
    NULL AS lot_number,
    NULL AS building_name,
    TRUE  AS is_base_address,   -- synthetic parents always represent buildings
    TRUE  AS is_synthetic,
    1     AS hierarchy_rank,    -- rank 1 = highest priority in search results
    NULL  AS lga_code,
    NULL  AS lga_name,
    NULL  AS mb_2016,
    NULL  AS mb_2021,
    NULL  AS mmm_2015,
    NULL  AS mmm_2019,
    NULL  AS mmm_2023

FROM gnaf_virtual_parents;

-- Required for cursor-based indexing (WHERE gnaf_pid > :last_pid)
CREATE UNIQUE INDEX idx_gnaf_export_pid ON gnaf_export_view (gnaf_pid);

-- ----------------------------------------------------------------
-- Verification queries (run after applying):
--
-- 1. Confirm new columns:
--    SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'gnaf' ORDER BY column_name;
--
-- 2. Confirm old columns gone:
--    SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'gnaf'
--    AND column_name IN ('confidence','mb_code','sa2_name','mmm_code');
--    -- Expect: 0 rows
--
-- 3. Confirm materialized view and row count:
--    SELECT COUNT(*) FROM gnaf_export_view;
--    -- Expect: ~16.8M (gnaf) + N (virtual parents)
--
-- 4. Confirm old view is gone:
--    SELECT * FROM gnaf_all LIMIT 1;
--    -- Expect: ERROR: relation "gnaf_all" does not exist
-- ----------------------------------------------------------------
