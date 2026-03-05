import boto3

def cleanup_progress_table(region_name='ap-southeast-2', table_name='aws-geocoding-pipeline-progress'):
    dynamo = boto3.resource('dynamodb', region_name=region_name)
    table = dynamo.Table(table_name)
    
    print(f"Scanning {table_name} for items to delete...")
    
    scan = table.scan()
    items = scan.get('Items', [])
    
    while 'LastEvaluatedKey' in scan:
        scan = table.scan(ExclusiveStartKey=scan['LastEvaluatedKey'])
        items.extend(scan.get('Items', []))
        
    print(f"Found {len(items)} items. Deleting...")
    
    with table.batch_writer() as batch:
        for item in items:
            batch.delete_item(
                Key={
                    'ExecutionId': item['ExecutionId'],
                    'StepName': item['StepName']
                }
            )
            
    print("Cleanup complete!")

if __name__ == '__main__':
    cleanup_progress_table()
