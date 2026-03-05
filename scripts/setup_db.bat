@echo off
echo ========================================================
echo   AWS Address Validation - DB Setup (Data API)
echo ========================================================

cd /d "%~dp0\..\terraform"

echo [INFO] Fetching Cluster outputs...
for /f "tokens=*" %%i in ('terraform output -raw db_endpoint') do set DB_ENDPOINT=%%i
REM We need the Cluster ARN for Data API, not Endpoint. 
REM Terraform output currently doesn't export ARN in database.tf. 
REM I will query it via AWS CLI.

echo [INFO] Fetching Secret ARN...
for /f "tokens=*" %%i in ('terraform output -raw db_secret_arn') do set SECRET_ARN=%%i

echo [INFO] Fetching Cluster ARN...
for /f "tokens=*" %%i in ('aws rds describe-db-clusters --db-cluster-identifier aws-geocoding-aurora-cluster --query "DBClusters[0].DBClusterArn" --output text') do set CLUSTER_ARN=%%i

if "%CLUSTER_ARN%"=="" (
    echo [ERROR] Could not find Cluster ARN. Is the DB created?
    exit /b 1
)

echo.
echo [INFO] Enabling Extensions...
aws rds-data execute-statement --resource-arn "%CLUSTER_ARN%" --secret-arn "%SECRET_ARN%" --database "geocoder" --sql "CREATE EXTENSION IF NOT EXISTS postgis;"
aws rds-data execute-statement --resource-arn "%CLUSTER_ARN%" --secret-arn "%SECRET_ARN%" --database "geocoder" --sql "CREATE EXTENSION IF NOT EXISTS pg_trgm;"

echo.
echo [INFO] Creating G-NAF Table...
aws rds-data execute-statement --resource-arn "%CLUSTER_ARN%" --secret-arn "%SECRET_ARN%" --database "geocoder" --sql "CREATE TABLE IF NOT EXISTS gnaf (gnaf_pid TEXT PRIMARY KEY, address_string TEXT NOT NULL, geom GEOMETRY(POINT, 4326), state TEXT, postcode TEXT);"

echo.
echo [INFO] Creating Indexes...
aws rds-data execute-statement --resource-arn "%CLUSTER_ARN%" --secret-arn "%SECRET_ARN%" --database "geocoder" --sql "CREATE INDEX IF NOT EXISTS idx_gnaf_address_trgm ON gnaf USING gist (address_string gist_trgm_ops);"

echo.
echo [SUCCESS] Schema Setup Complete (Partial).

