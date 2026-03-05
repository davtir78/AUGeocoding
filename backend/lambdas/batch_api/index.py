import os
import json
import uuid
import boto3
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)

s3 = boto3.client('s3')
RAW_BUCKET = os.environ['RAW_BUCKET_NAME']
RESULTS_BUCKET = os.environ['RESULTS_BUCKET_NAME']
REGION = os.environ.get('AWS_REGION', 'ap-southeast-2')
URL_EXPIRY = 300  # 5 minutes

import botocore

def handler(event, context):
    try:
        method = event['requestContext']['http']['method']
        path = event['requestContext']['http']['path']
        
        if method == 'POST' and path == '/jobs':
            return create_job()
        elif method == 'GET' and path.startswith('/jobs/'):
            job_id = path.split('/')[-1]
            return get_job_status(job_id)
        else:
            return response(404, {"error": "Not Found"})
            
    except Exception as e:
        logger.error(f"Error: {e}", exc_info=True)
        return response(500, {"error": str(e)})


def create_job():
    job_id = str(uuid.uuid4())
    key = f"uploads/{job_id}.csv"
    
    # Generate presigned PUT URL
    try:
        url = s3.generate_presigned_url(
            ClientMethod='put_object',
            Params={
                'Bucket': RAW_BUCKET,
                'Key': key,
                'ContentType': 'text/csv'
            },
            ExpiresIn=URL_EXPIRY
        )
        return response(201, {
            "job_id": job_id,
            "upload_url": url,
            "message": "Upload CSV to 'upload_url' via PUT request."
        })
    except Exception as e:
        logger.error(f"Failed to generate presigned URL: {e}")
        raise e

def get_job_status(job_id):
    # Check if result exists
    result_key = f"results/{job_id}_results.csv"
    try:
        s3.head_object(Bucket=RESULTS_BUCKET, Key=result_key)
        # Results exist -> COMPLETED
        download_url = s3.generate_presigned_url(
            ClientMethod='get_object',
            Params={
                'Bucket': RESULTS_BUCKET,
                'Key': result_key,
                'ResponseContentDisposition': 'attachment; filename="results.csv"'
            },
            ExpiresIn=URL_EXPIRY
        )
        return response(200, {
            "job_id": job_id,
            "status": "COMPLETED",
            "download_url": download_url
        })
    except botocore.exceptions.ClientError as e:
        # If 404, check if input exists
        error_code = e.response['Error']['Code']
        if error_code == "404" or error_code == "NoSuchKey":
            upload_key = f"uploads/{job_id}.csv"
            try:
                s3.head_object(Bucket=RAW_BUCKET, Key=upload_key)
                return response(200, {"job_id": job_id, "status": "PROCESSING"})
            except botocore.exceptions.ClientError:
                 return response(404, {"job_id": job_id, "status": "NOT_FOUND"})
        else:
            logger.error(f"S3 Error checking status: {e}")
            raise e

def response(status, body):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
        },
        "body": json.dumps(body)
    }
