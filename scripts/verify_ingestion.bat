@echo off
echo ========================================================
echo   AWS Address Validation - Verify Ingestion
echo ========================================================

cd /d "%~dp0\..\terraform"

for /f "tokens=*" %%i in ('terraform output -raw db_secret_arn') do set SECRET_ARN=%%i
for /f "tokens=*" %%i in ('aws rds describe-db-clusters --db-cluster-identifier aws-geocoding-aurora-cluster --query "DBClusters[0].DBClusterArn" --output text') do set CLUSTER_ARN=%%i

echo.
echo [INFO] Querying G-NAF Count...
aws rds-data execute-statement --resource-arn "%CLUSTER_ARN%" --secret-arn "%SECRET_ARN%" --database "geocoder" --sql "SELECT count(*) FROM gnaf;" --format-records-as JSON
