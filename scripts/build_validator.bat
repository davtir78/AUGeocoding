@echo off
cd /d "%~dp0"

echo [INFO] Building Validator Lambda (This may take a while - compiling libpostal)...

:: Get Account ID
for /f "tokens=*" %%i in ('aws sts get-caller-identity --query "Account" --output text') do set ACCOUNT_ID=%%i
set REGION=ap-southeast-2
set REPO_NAME=aws-geocoding-validator
set IMAGE_URI=%ACCOUNT_ID%.dkr.ecr.%REGION%.amazonaws.com/%REPO_NAME%

echo [INFO] Account ID: %ACCOUNT_ID%

:: Login to ECR
echo.
echo [1/3] Logging in to ECR...
aws ecr get-login-password --region %REGION% | docker login --username AWS --password-stdin %ACCOUNT_ID%.dkr.ecr.%REGION%.amazonaws.com

:: Build Docker Image
echo.
echo [2/3] Building Docker Image...
docker build --platform linux/amd64 --provenance=false -t %REPO_NAME% ../backend/lambdas/validator

:: Tag and Push
echo.
echo [3/3] Pushing to ECR...
docker tag %REPO_NAME%:latest %IMAGE_URI%:latest
docker push %IMAGE_URI%:latest

echo.
echo [SUCCESS] Validator Image Pushed to %IMAGE_URI%:latest

echo.
echo [4/4] Updating Lambda function to use latest image...
aws lambda update-function-code --function-name aws-geocoding-validator --image-uri %IMAGE_URI%:latest --region %REGION%
aws lambda wait function-updated --function-name aws-geocoding-validator --region %REGION%

echo.
echo [SUCCESS] Lambda Updated: %IMAGE_URI%:latest
:: pause

