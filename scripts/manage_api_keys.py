"""
Manage API keys for programmatic access.

Usage:
  python scripts/manage_api_keys.py create --name "My Integration" --expires 365
  python scripts/manage_api_keys.py list
  python scripts/manage_api_keys.py revoke --key abc123...
"""
import boto3
import uuid
import hashlib
import argparse
from datetime import datetime, timedelta, timezone

TABLE_NAME = "aws-geocoding-api-keys"

def create_key(name, expires_days=365):
    raw_key = str(uuid.uuid4())
    hashed = hashlib.sha256(raw_key.encode()).hexdigest()

    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(TABLE_NAME)

    item = {
        'api_key': hashed,
        'name': name,
        'status': 'active',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'expires_at': (datetime.now(timezone.utc) + timedelta(days=expires_days)).isoformat(),
    }

    table.put_item(Item=item)

    print(f"API Key Created:")
    print(f"  Name:    {name}")
    print(f"  Key:     {raw_key}")    # Show the unhashed key (this is the ONLY time it's visible)
    print(f"  Expires: {item['expires_at']}")
    print(f"\n⚠️  Save this key now — it cannot be retrieved later.")

def list_keys():
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(TABLE_NAME)
    response = table.scan()
    for item in response.get('Items', []):
        print(f"  {item['name']:30s}  {item['status']:10s}  expires={item.get('expires_at', 'never')}")

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest='command')
    c = sub.add_parser('create')
    c.add_argument('--name', required=True)
    c.add_argument('--expires', type=int, default=365)
    sub.add_parser('list')
    args = parser.parse_args()

    if args.command == 'create':
        create_key(args.name, args.expires)
    elif args.command == 'list':
        list_keys()
