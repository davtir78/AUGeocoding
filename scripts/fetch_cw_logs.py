import boto3
import time
import sys

def get_logs(log_group_name):
    client = boto3.client('logs', region_name='ap-southeast-2')
    
    print(f"Fetching logs for {log_group_name}...")
    try:
        # Get latest log stream
        streams = client.describe_log_streams(
            logGroupName=log_group_name,
            orderBy='LastEventTime',
            descending=True,
            limit=1
        )
        
        if not streams['logStreams']:
            print("No log streams found.")
            return

        stream_name = streams['logStreams'][0]['logStreamName']
        print(f"Reading stream: {stream_name}")
        
        events = client.get_log_events(
            logGroupName=log_group_name,
            logStreamName=stream_name,
            limit=20,
            startFromHead=False
        )
        
        for event in events['events']:
            print(f"{event['timestamp']} - {event['message'].strip()}")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    target = "/aws/lambda/aws-geocoding-progress-manager"
    if len(sys.argv) > 1:
        target = sys.argv[1]
        # If arg doesn't start with /, assume it's a function name
        if not target.startswith("/"):
            target = f"/aws/lambda/{target}"
            
    get_logs(target)
