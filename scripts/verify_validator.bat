@echo off
echo ========================================================
echo   AWS Address Validation - Verify Validator API
echo ========================================================

cd /d "%~dp0\..\terraform"

:: Get API Endpoint
for /f "tokens=*" %%i in ('terraform output -raw api_endpoint') do set API_URL=%%i

if "%API_URL%"=="" (
    echo [ERROR] Could not get API URL. Is Terraform applied?
    exit /b 1
)

echo [INFO] API URL: %API_URL%

echo.
echo [TEST 1] Testing "123 Main St, Sydney"
echo Payload: {"address": "123 Main St, Sydney"}
curl -X POST -H "Content-Type: application/json" -d "{\"address\": \"123 Main St, Sydney\"}" %API_URL%/geocode
echo.

echo.
echo [TEST 2] Testing "Under Princes Bridge" (Fuzzy Match)
echo Payload: {"address": "Under Princes Bridge"}
curl -X POST -H "Content-Type: application/json" -d "{\"address\": \"Under Princes Bridge\"}" %API_URL%/geocode
echo.
