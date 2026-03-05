import boto3
import zipfile
import os
import sys

def deploy():
    function_name = 'aws-geocoding-progress-manager'
    source_file = 'backend/lambdas/update_progress/index.py'
    zip_name = 'update_progress.zip'
    region = 'ap-southeast-2'
    
    # 1. Zip the file
    print(f"Zipping {source_file}...")
    if not os.path.exists(source_file):
        print(f"Error: {source_file} not found")
        sys.exit(1)
        
    try:
        with zipfile.ZipFile(zip_name, 'w') as z:
            z.write(source_file, 'index.py')
    except Exception as e:
        print(f"Error creating zip: {e}")
        sys.exit(1)
        
    # 2. Deploy via Boto3
    print(f"Deploying to {function_name} in {region}...")
    try:
        lambda_client = boto3.client('lambda', region_name=region)
        with open(zip_name, 'rb') as f:
            zip_content = f.read()
            
        response = lambda_client.update_function_code(
            FunctionName=function_name,
            ZipFile=zip_content
        )
        print(f"Success! New version: {response['Version']}")
        print(f"Last Modified: {response['LastModified']}")
        
    except Exception as e:
        print(f"Deployment failed: {e}")
        sys.exit(1)
    finally:
        # Cleanup
        if os.path.exists(zip_name):
            os.remove(zip_name)
            print("Cleaned up zip file.")

if __name__ == '__main__':
    deploy()
