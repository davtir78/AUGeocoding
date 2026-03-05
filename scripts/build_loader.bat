@echo off
set "REGION=ap-southeast-2"
set "ACCOUNT_ID="

echo [INFO] getting AWS Account ID...
for /f "tokens=*" %%i in ('aws sts get-caller-identity --query "Account" --output text') do set ACCOUNT_ID=%%i

if "%ACCOUNT_ID%"=="" (
    echo [ERROR] Could not get AWS Account ID. Check your credentials.
    exit /b 1
)

echo [INFO] Account ID: %ACCOUNT_ID%
set "REPO_URI=%ACCOUNT_ID%.dkr.ecr.%REGION%.amazonaws.com/aws-geocoding-loader"

echo.
echo [1/3] Logging in to ECR...
aws ecr get-login-password --region %REGION% | docker login --username AWS --password-stdin %ACCOUNT_ID%.dkr.ecr.%REGION%.amazonaws.com

cd /d "%~dp0"
echo.
echo [2/3] Building Docker Image...
docker build --platform linux/amd64 --provenance=false -t aws-geocoding-loader ../backend/lambdas/loader

echo.
echo [3/4] Tagging and Pushing...
docker tag aws-geocoding-loader:latest %REPO_URI%:latest
docker push %REPO_URI%:latest

echo.
echo [4/4] Updating Lambda function to use latest image...
aws lambda update-function-code --function-name aws-geocoding-loader --image-uri %REPO_URI%:latest --region %REGION%
aws lambda wait function-updated --function-name aws-geocoding-loader --region %REGION%

echo.
echo [SUCCESS] Image Pushed and Lambda Updated: %REPO_URI%:latest
