@echo off
setlocal

set "LAMBDA_NAME=aws-geocoding-progress-manager"
set "SRC_DIR=backend/lambdas/update_progress"
set "ZIP_FILE=update_progress.zip"

echo Building %LAMBDA_NAME%...

REM Create zip file
cd %SRC_DIR%
tar -a -c -f ../../../%ZIP_FILE% *
cd ../../..

echo Deploying to Lambda...
aws lambda update-function-code --function-name %LAMBDA_NAME% --zip-file fileb://%ZIP_FILE%

echo Cleanup...
del %ZIP_FILE%

echo Done!
