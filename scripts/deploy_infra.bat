@echo off
echo ========================================================
echo   AWS Address Validation - Infrastructure Deploy
echo ========================================================

cd /d "%~dp0\..\terraform"

echo.
echo [1/2] Initializing Terraform...
terraform init
if %errorlevel% neq 0 (
    echo [ERROR] Terraform init failed.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/2] Applying Configuration...
terraform apply
if %errorlevel% neq 0 (
    echo [ERROR] Terraform apply failed.
    pause
    exit /b %errorlevel%
)

echo.
echo [SUCCESS] Infrastructure Deployed.
pause
