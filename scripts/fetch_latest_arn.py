import boto3
import sys
import os

def get_latest_execution_arn():
    client = boto3.client('stepfunctions', region_name='ap-southeast-2')
    state_machine_arn = "arn:aws:states:ap-southeast-2:657416661258:stateMachine:aws-geocoding-orchestrator"
    
    try:
        response = client.list_executions(
            stateMachineArn=state_machine_arn,
            maxResults=1
        )
        executions = response.get('executions', [])
        if not executions:
            print("No executions found.")
            return None
        
        latest_arn = executions[0]['executionArn']
        print(f"Latest Execution ARN: {latest_arn}")
        return latest_arn
    except Exception as e:
        print(f"Error fetching executions: {e}")
        return None

if __name__ == "__main__":
    arn = get_latest_execution_arn()
    if arn:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        file_path = os.path.join(script_dir, "active_execution_arn.txt")
        with open(file_path, "w") as f:
            f.write(arn)
