-- Enable Extensions for Geospatial and Fuzzy Search
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- G-NAF Addressing Table (Simplified for POC)
CREATE TABLE IF NOT EXISTS gnaf (
    gnaf_pid TEXT PRIMARY KEY,
    primary_pid TEXT,
    primary_secondary TEXT,
    address_string TEXT NOT NULL,
    geom GEOMETRY(POINT, 4326),
    state TEXT,
    postcode TEXT,
    version TEXT,
    building_name TEXT,
    lot_number TEXT,
    flat_number TEXT,
    level_number TEXT,
    number_first TEXT,
    number_last TEXT,
    street_name TEXT,
    street_type TEXT,
    street_suffix TEXT,
    locality TEXT,
    longitude NUMERIC(12,8),
    latitude NUMERIC(12,8)
);

-- Sprint 6 Schema: Longitudinal multi-year enrichment columns
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS is_synthetic BOOLEAN DEFAULT FALSE;
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS hierarchy_rank SMALLINT DEFAULT 0;
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS lga_code VARCHAR(10);
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS lga_name VARCHAR(100);
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS mb_2016 VARCHAR(15);
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS mb_2021 VARCHAR(15);
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS mmm_2015 INT;
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS mmm_2019 INT;
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS mmm_2023 INT;
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS longitude NUMERIC(12,8);
ALTER TABLE gnaf ADD COLUMN IF NOT EXISTS latitude NUMERIC(12,8);

-- Index for Fuzzy Search
CREATE INDEX IF NOT EXISTS idx_gnaf_address_trgm ON gnaf USING gist (address_string gist_trgm_ops);
-- Index for Geospatial
CREATE INDEX IF NOT EXISTS idx_gnaf_geom ON gnaf USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_gnaf_street_locality ON gnaf (street_name, number_first, locality, postcode);


-- Gazetteer Table (Landmarks)
CREATE TABLE IF NOT EXISTS gazetteer (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    class TEXT, -- e.g. BRIDGE, PARK
    geom GEOMETRY(POINT, 4326)
);

-- Index for Fuzzy Search
CREATE INDEX IF NOT EXISTS idx_gazetteer_name_trgm ON gazetteer USING gist (name gist_trgm_ops);
-- Index for Geospatial
CREATE INDEX IF NOT EXISTS idx_gazetteer_geom ON gazetteer USING gist (geom);


-- MMM (Modified Monash Model) - Remoteness Areas
CREATE TABLE IF NOT EXISTS mmm (
    id SERIAL PRIMARY KEY,
    year INT NOT NULL, -- 2015, 2019, 2023
    mmm_code INT, -- 1-7
    geom GEOMETRY(MULTIPOLYGON, 4326)
);

CREATE INDEX IF NOT EXISTS idx_mmm_geom ON mmm USING gist (geom);

-- LGA (Local Government Areas)
CREATE TABLE IF NOT EXISTS lga (
    id SERIAL PRIMARY KEY,
    lga_code VARCHAR(10),
    lga_name VARCHAR(100),
    state_code VARCHAR(3),
    state_name VARCHAR(50),
    area_sqkm NUMERIC(12,4),
    geom GEOMETRY(MultiPolygon, 4326)
);
CREATE INDEX IF NOT EXISTS idx_lga_geom ON lga USING GIST (geom);

-- Mesh Block (Statistical Micro-Areas)
CREATE TABLE IF NOT EXISTS mesh_block (
    id SERIAL PRIMARY KEY,
    mb_code VARCHAR(15),
    mb_category VARCHAR(50),
    sa1_code VARCHAR(15),
    sa2_code VARCHAR(15),
    sa2_name VARCHAR(100),
    state_code VARCHAR(3),
    state_name VARCHAR(50),
    area_sqkm NUMERIC(12,4),
    geom GEOMETRY(MultiPolygon, 4326)
);
CREATE INDEX IF NOT EXISTS idx_mb_geom ON mesh_block USING GIST (geom);

-- Synthetic Parent Injection Table (Scenario A Fix)
CREATE TABLE IF NOT EXISTS gnaf_virtual_parents (
    gnaf_pid VARCHAR(50) PRIMARY KEY,
    address_string TEXT NOT NULL,
    number_first TEXT,
    number_last TEXT,
    street_name TEXT,
    street_type VARCHAR(20),
    street_suffix VARCHAR(10),
    locality TEXT,
    state VARCHAR(10),
    postcode VARCHAR(10),
    longitude NUMERIC(12,8),
    latitude NUMERIC(12,8),
    geom GEOMETRY(Point, 4326),
    version TEXT,
    is_synthetic BOOLEAN DEFAULT TRUE,
    hierarchy_rank SMALLINT DEFAULT 1,
    child_count INT
);
CREATE INDEX IF NOT EXISTS idx_gvp_geom ON gnaf_virtual_parents USING gist (geom);

-- G-NAF Source of Truth (Materialized View — unions canonical + synthetic)
-- IMPORTANT: The gnaf_export_view is defined in backend/sql/views.sql.
-- After running this schema file, you MUST apply views.sql to create the view:
--   psql -h $DB_HOST -d $DB_NAME -U $DB_USER -f backend/sql/views.sql
-- 
-- The view performs a LEFT JOIN to denormalize primary_address_string
-- from the PRIMARY_PID relationship (Sprint 7 — see docs/gnaf_pid_discrepancy.md).

