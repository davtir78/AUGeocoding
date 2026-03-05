@echo off
setlocal
cd /d "%~dp0\..\terraform"

echo [INFO] Fetching Terraform Outputs...
for /f "tokens=*" %%i in ('terraform output -raw frontend_bucket_name') do set BUCKET_NAME=%%i
for /f "tokens=*" %%i in ('terraform output -raw cloudfront_distribution_id') do set DIST_ID=%%i
for /f "tokens=*" %%i in ('terraform output -raw api_endpoint') do set API_ENDPOINT=%%i
for /f "tokens=*" %%i in ('terraform output -raw frontend_url') do set CLOUDFRONT_URL=%%i
for /f "tokens=*" %%i in ('terraform output -raw region') do set REGION=%%i
for /f "tokens=*" %%i in ('terraform output -raw map_name') do set MAP_NAME=%%i
for /f "tokens=*" %%i in ('terraform output -raw user_pool_id') do set USER_POOL_ID=%%i
for /f "tokens=*" %%i in ('terraform output -raw user_pool_client_id') do set USER_POOL_CLIENT_ID=%%i
for /f "tokens=*" %%i in ('terraform output -raw identity_pool_id') do set IDENTITY_POOL_ID=%%i

if "%BUCKET_NAME%"=="" (
    echo [ERROR] Could not fetch bucket name. Is Terraform applied?
    exit /b 1
)

echo [INFO] Configuring Frontend...
echo   API: %API_ENDPOINT%
echo   Region: %REGION%
echo   Map: %MAP_NAME%
echo   User Pool: %USER_POOL_ID%
echo   Client ID: %USER_POOL_CLIENT_ID%
echo   Identity Pool: %IDENTITY_POOL_ID%

cd /d "%~dp0"
set CLOUDFRONT_URL=%CLOUDFRONT_URL%
set API_ENDPOINT=%API_ENDPOINT%
set REGION=%REGION%
set MAP_NAME=%MAP_NAME%
set USER_POOL_ID=%USER_POOL_ID%
set USER_POOL_CLIENT_ID=%USER_POOL_CLIENT_ID%
set IDENTITY_POOL_ID=%IDENTITY_POOL_ID%
node generate_config.js

cd /d "%~dp0\..\frontend"
echo [INFO] Installing Dependencies...
call npm install

echo [INFO] Building Frontend...
call npm run build

echo [INFO] Deploying to S3 (%BUCKET_NAME%)...
aws s3 sync dist s3://%BUCKET_NAME% --delete

echo [INFO] Invalidating CloudFront Cache (%DIST_ID%)...
aws cloudfront create-invalidation --distribution-id %DIST_ID% --paths "/*"

echo [SUCCESS] Frontend Deployed!
endlocal
