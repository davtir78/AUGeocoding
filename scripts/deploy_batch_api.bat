@echo off
set BASE_DIR=%~dp0..
echo Logging in to ECR...
aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin 657416661258.dkr.ecr.ap-southeast-2.amazonaws.com

echo Building Batch API...
docker build --platform linux/amd64 --provenance=false -t aws-geocoding-batch-api %BASE_DIR%/backend/lambdas/batch_api

echo Tagging...
docker tag aws-geocoding-batch-api:latest 657416661258.dkr.ecr.ap-southeast-2.amazonaws.com/aws-geocoding-batch-api:latest

echo Pushing...
docker push 657416661258.dkr.ecr.ap-southeast-2.amazonaws.com/aws-geocoding-batch-api:latest

echo Updating Lambda...
aws lambda update-function-code --function-name aws-geocoding-batch-api --image-uri 657416661258.dkr.ecr.ap-southeast-2.amazonaws.com/aws-geocoding-batch-api:latest

echo Done.
