@echo off
cd /d "%~dp0"

echo [INFO] Building Batch Processing Lambdas...

:: Get Account ID
for /f "tokens=*" %%i in ('aws sts get-caller-identity --query "Account" --output text') do set ACCOUNT_ID=%%i
set REGION=ap-southeast-2

echo [INFO] Account ID: %ACCOUNT_ID%

:: Login to ECR
echo.
echo [1/3] Logging in to ECR...
aws ecr get-login-password --region %REGION% | docker login --username AWS --password-stdin %ACCOUNT_ID%.dkr.ecr.%REGION%.amazonaws.com

:: Function 1: Batch API
set REPO_API=aws-geocoding-batch-api
set IMAGE_API=%ACCOUNT_ID%.dkr.ecr.%REGION%.amazonaws.com/%REPO_API%

echo.
echo [2/3] Building Batch API...
docker build --platform linux/amd64 --provenance=false -t %REPO_API% ../backend/lambdas/batch_api
docker tag %REPO_API%:latest %IMAGE_API%:latest
docker push %IMAGE_API%:latest

:: Function 2: Batch Processor
set REPO_PROC=aws-geocoding-batch-processor
set IMAGE_PROC=%ACCOUNT_ID%.dkr.ecr.%REGION%.amazonaws.com/%REPO_PROC%

echo.
echo [3/3] Building Batch Processor...
docker build --platform linux/amd64 --provenance=false -t %REPO_PROC% ../backend/lambdas/batch_processor
docker tag %REPO_PROC%:latest %IMAGE_PROC%:latest
docker push %IMAGE_PROC%:latest

echo.
echo [SUCCESS] Batch Images Pushed.
pause
