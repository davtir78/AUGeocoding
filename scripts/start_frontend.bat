@echo off
set BASE_DIR=%~dp0..
echo Starting AWS Geocoding Frontend...

echo [INFO] Generating Amplify Configuration...
cd /d "%BASE_DIR%\terraform"
for /f "tokens=*" %%i in ('terraform output -raw api_endpoint') do set API_ENDPOINT=%%i
for /f "tokens=*" %%i in ('terraform output -raw region') do set REGION=%%i
for /f "tokens=*" %%i in ('terraform output -raw map_name') do set MAP_NAME=%%i
for /f "tokens=*" %%i in ('terraform output -raw user_pool_id') do set USER_POOL_ID=%%i
for /f "tokens=*" %%i in ('terraform output -raw user_pool_client_id') do set USER_POOL_CLIENT_ID=%%i
for /f "tokens=*" %%i in ('terraform output -raw identity_pool_id') do set IDENTITY_POOL_ID=%%i

echo   API: %API_ENDPOINT%
echo   Region: %REGION%
echo   Map: %MAP_NAME%
echo   User Pool: %USER_POOL_ID%
echo   Client ID: %USER_POOL_CLIENT_ID%
echo   Identity Pool: %IDENTITY_POOL_ID%

cd /d "%BASE_DIR%\scripts"
set API_ENDPOINT=%API_ENDPOINT%
set REGION=%REGION%
set MAP_NAME=%MAP_NAME%
set USER_POOL_ID=%USER_POOL_ID%
set USER_POOL_CLIENT_ID=%USER_POOL_CLIENT_ID%
set IDENTITY_POOL_ID=%IDENTITY_POOL_ID%
node generate_config.js

echo [INFO] Starting Dev Server...
cd /d "%BASE_DIR%\frontend"
npm run dev
pause


