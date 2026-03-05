"""
API Key Authorizer for API Gateway.

This Lambda is invoked by API Gateway before the actual target Lambda.
It checks the X-API-Key header against the DynamoDB api_keys table.

If the key is valid and not expired, it returns an IAM policy that
ALLOWS the request. Otherwise, it returns DENY.
"""
import os
import boto3
import logging
from datetime import datetime, timezone

logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['API_KEYS_TABLE'])

def handler(event, context):
    # Extract the API key from the request headers.
    # API Gateway passes headers in event['headers'].
    api_key = event.get('headers', {}).get('x-api-key')

    if not api_key:
        logger.warning("No API key provided")
        return generate_policy('anonymous', 'Deny', event['routeArn'])

    # Look up the key in DynamoDB.
    try:
        response = table.get_item(Key={'api_key': api_key})
    except Exception as e:
        logger.error(f"DynamoDB lookup failed: {e}")
        return generate_policy('error', 'Deny', event['routeArn'])

    item = response.get('Item')
    if not item:
        logger.warning(f"API key not found: {api_key[:8]}...")
        return generate_policy('unknown', 'Deny', event['routeArn'])

    # Check if the key is active and not expired.
    if item.get('status') != 'active':
        logger.warning(f"API key is not active: {item.get('name')}")
        return generate_policy(item.get('name'), 'Deny', event['routeArn'])

    expires_at = item.get('expires_at')
    if expires_at:
        if datetime.fromisoformat(expires_at) < datetime.now(timezone.utc):
            logger.warning(f"API key expired: {item.get('name')}")
            return generate_policy(item.get('name'), 'Deny', event['routeArn'])

    logger.info(f"API key authenticated: {item.get('name')}")
    return generate_policy(item.get('name'), 'Allow', event['routeArn'])


def generate_policy(principal_id, effect, resource):
    """Generate an IAM policy document for API Gateway."""
    return {
        'principalId': principal_id,
        'policyDocument': {
            'Version': '2012-10-17',
            'Statement': [{
                'Action': 'execute-api:Invoke',
                'Effect': effect,
                'Resource': resource,
            }]
        }
    }
