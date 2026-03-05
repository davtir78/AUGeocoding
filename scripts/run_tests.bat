@echo off
echo ============================================================
echo   AU Geocoding - Run Validator Integration Tests
echo ============================================================
echo.

cd /d "%~dp0\.."

echo Running tests against aws-geocoding-validator Lambda...
echo.

python tests/test_validator_opensearch.py --save

echo.
echo ============================================================
echo   Done. Results saved to tests\results\
echo ============================================================
pause
