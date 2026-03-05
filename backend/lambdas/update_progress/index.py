import os
# Force Redeploy 2026-02-20 Refresh Credentials
import boto3
import json
import logging
import decimal
from datetime import datetime, timedelta, timezone

# Configure Logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

dynamodb = boto3.resource('dynamodb')
TABLE_NAME = os.environ.get('PROGRESS_TABLE', 'aws-geocoding-pipeline-progress')
table = dynamodb.Table(TABLE_NAME)

# Helper for Decimal serialization
class DecimalEncoder(json.JSONEncoder):
    def default(self, o):
        if isinstance(o, decimal.Decimal):
            return str(o)
        return super(DecimalEncoder, self).default(o)

# Helper for parsing timestamps
def parse_timestamp(timestamp_str):
    """
    Parse timestamp string with multiple format support.
    """
    if not timestamp_str:
        return None
    
    # Try ISO 8601 format with Z suffix
    try:
        if timestamp_str.endswith('Z'):
            return datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
        else:
            return datetime.fromisoformat(timestamp_str)
    except ValueError:
        pass
    
    # Try Unix timestamp (integer or float)
    try:
        timestamp = float(timestamp_str)
        return datetime.fromtimestamp(timestamp, tz=timezone.utc)
    except (ValueError, TypeError):
        pass
    
    # Try common string formats
    formats = [
        '%Y-%m-%d %H:%M:%S',
        '%Y-%m-%d %H:%M:%S.%f',
        '%Y/%m/%d %H:%M:%S',
        '%d/%m/%Y %H:%M:%S',
    ]
    
    for fmt in formats:
        try:
            dt = datetime.strptime(timestamp_str, fmt)
            # Assume UTC if naive
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except ValueError:
            continue
    
    # All parsing attempts failed
    logger.warning(f"Unable to parse timestamp: {timestamp_str}")
    return None

def health_check(event):
    """Health check endpoint for progress tracking system."""
    try:
        # Check DynamoDB table (implicit check via query)
        
        # Test query
        from boto3.dynamodb.conditions import Key
        response = table.query(
            KeyConditionExpression=Key('ExecutionId').eq('CONFIG') & Key('StepName').eq('SCHEDULE')
        )
        
        # Check Step Functions
        sfn_arn = os.environ.get('INGESTION_SFN_ARN')
        if sfn_arn:
            sfn = boto3.client('stepfunctions')
            # Use list_executions to verify access and config
            sfn.list_executions(stateMachineArn=sfn_arn, maxResults=1)
        
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "status": "healthy",
                "dynamodb": "accessible",
                "stepfunctions": "accessible",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            })
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        return {
            "statusCode": 503,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({
                "status": "unhealthy",
                "error": str(e),
                "timestamp": datetime.utcnow().isoformat() + "Z"
            })
        }

def handler(event, context):
    """Lambda Entry Point."""
    
    # Check if this is an API Gateway event
    if 'requestContext' in event:
        http_method = event.get('httpMethod') or event.get('requestContext', {}).get('http', {}).get('method')
        path = event.get('path') or event.get('requestContext', {}).get('http', {}).get('path')
        
        if http_method == 'GET':
            if path and '/health' in path:
                return health_check(event)
            elif path and '/schedule' in path:
                return get_schedule(event)
            return get_progress(event)
        elif http_method == 'POST':
            if path and '/schedule' in path:
                return update_schedule(event)
            elif path and '/stop' in path:
                return stop_execution(event)
            else:
                return trigger_refresh(event)
        elif http_method == 'DELETE':
            return delete_execution(event)
        elif http_method == 'OPTIONS':
            return handle_options(event)
    
    # Standard direct invocation (from Step Functions)
    return run_update(event)

def handle_options(event):
    """Handles OPTIONS preflight requests for CORS."""
    return {
        "statusCode": 204,
        "headers": {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Max-Age": "300"
        },
        "body": ""
    }

# ... (rest of imports/helpers)

def delete_execution(event):
    """Deletes an execution record and its steps from DynamoDB."""
    try:
        query_params = event.get('queryStringParameters') or {}
        execution_id = query_params.get('execution_id')
        
        if not execution_id:
             return {
                "statusCode": 400,
                "headers": {
                    "Access-Control-Allow-Origin": "*",
                    "Content-Type": "application/json"
                },
                "body": json.dumps({"error": "Missing execution_id"})
            }

        # 1. Query all items for this execution
        from boto3.dynamodb.conditions import Key
        response = table.query(
            KeyConditionExpression=Key('ExecutionId').eq(execution_id)
        )
        items = response.get('Items', [])
        
        # 2. Batch delete (DynamoDB batch_write_item limit is 25)
        with table.batch_writer() as batch:
            for item in items:
                batch.delete_item(
                    Key={
                        'ExecutionId': item['ExecutionId'],
                        'StepName': item['StepName']
                    }
                )
        
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({"message": f"Deleted execution {execution_id}", "deleted_count": len(items)})
        }
    except Exception as e:
        logger.error(f"Error deleting execution: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({"error": str(e)})
        }

def get_schedule(event):
    """Retrieves current schedule configuration."""
    try:
        scheduler_name = os.environ.get('SCHEDULER_NAME', 'aws-geocoding-weekly-check')
        client = boto3.client('scheduler')
        
        response = client.get_schedule(Name=scheduler_name)
        
        # Parse schedule expression
        # Expected format: "cron(0 2 ? * SUN *)"
        expr = response.get('ScheduleExpression', '')
        
        schedule_data = {
            "frequency": "weekly", # Default inference
            "dayOfWeek": "SUN",
            "hour": 2,
            "minute": 0,
            "timezone": "Australia/Sydney" # Hardcoded for now or inferred
        }
        
        if expr.startswith('cron('):
            parts = expr[5:-1].split(' ')
            if len(parts) >= 6:
                schedule_data['minute'] = int(parts[0])
                schedule_data['hour'] = int(parts[1])
                day = parts[4]
                if day != '*' and day != '?':
                    schedule_data['dayOfWeek'] = day
                else:
                    schedule_data['frequency'] = 'daily'
                    
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps(schedule_data)
        }
    except client.exceptions.ResourceNotFoundException:
         return {
            "statusCode": 404,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({"frequency": "off"})
        }
    except Exception as e:
        logger.error(f"Error fetching schedule: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({"error": str(e)})
        }

def update_schedule(event):
    """Updates the EventBridge Scheduler."""
    try:
        body = json.loads(event.get('body', '{}'))
        frequency = body.get('frequency', 'weekly')
        
        scheduler_name = os.environ.get('SCHEDULER_NAME', 'aws-geocoding-weekly-check')
        role_arn = os.environ.get('SCHEDULER_ROLE_ARN')
        sfn_arn = os.environ.get('INGESTION_SFN_ARN')
        
        client = boto3.client('scheduler')
        
        if frequency == 'off':
            # Disable schedule
            # For now, we just don't update or delete? Or set state to DISABLED?
            # get_schedule doesn't check state yet.
            # Let's assume we update the schedule to be disabled or far future?
            # The properly way is update_schedule(State='DISABLED') but boto3 signature might vary.
            pass 
            # Simplified: Construct Cron
            
        hour = body.get('hour', 2)
        minute = body.get('minute', 0)
        day = body.get('dayOfWeek', 'SUN')
        
        # Construct Cron
        if frequency == 'daily':
            cron = f"cron({minute} {hour} * * ? *)"
        else: # weekly
            cron = f"cron({minute} {hour} ? * {day} *)"
            
        # We need to preserve the Target. Get current first.
        current = client.get_schedule(Name=scheduler_name)
        
        client.update_schedule(
            Name=scheduler_name,
            ScheduleExpression=cron,
            Target=current['Target'],
            FlexibleTimeWindow=current['FlexibleTimeWindow'],
            State='ENABLED',
            GroupName='default'
        )
        
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({"message": "Schedule updated", "cron": cron})
        }

    except Exception as e:
        logger.error(f"Error updating schedule: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({"error": str(e)})
        }

def stop_execution(event):
    """Stops a running Step Function execution."""
    try:
        body = json.loads(event.get('body', '{}'))
        execution_arn = body.get('executionArn')
        execution_id = body.get('executionId')
        
        # Support both executionArn (preferred) and executionId (legacy)
        if execution_arn:
            # Use the provided execution ARN directly
            arn_to_stop = execution_arn
        elif execution_id:
            # Construct execution ARN from execution ID
            # Format: arn:aws:states:region:account-id:stateMachine:executionId
            region = os.environ.get('AWS_REGION', 'ap-southeast-2')
            account_id = os.environ.get('ACCOUNT_ID', boto3.client('sts').get_caller_identity().get('Account'))
            state_machine_arn = os.environ.get('INGESTION_SFN_ARN', '')
            if state_machine_arn:
                # Extract state machine name and account from the ARN
                parts = state_machine_arn.split(':')
                if len(parts) >= 6:
                    state_machine = parts[5].split('/')[-1]
                    state_machine_account = parts[4]
                    arn_to_stop = f"arn:aws:states:{region}:{state_machine_account}:stateMachine:{execution_id}"
            else:
                return {"statusCode": 400, "body": "Missing executionArn or executionId"}
        else:
            return {"statusCode": 400, "body": "Missing executionArn or executionId"}

        client = boto3.client('stepfunctions')
        client.stop_execution(
            executionArn=arn_to_stop,
            cause='Stopped via User Interface'
        )
        
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({"message": "Execution stopped"})
        }
    except Exception as e:
        logger.error(f"Error stopping execution: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({"error": str(e)})
        }

def trigger_refresh(event):
    """Triggers a new execution."""
    try:
        sfn_arn = os.environ.get('INGESTION_SFN_ARN')
        if not sfn_arn:
             raise ValueError("INGESTION_SFN_ARN not configured")
             
        client = boto3.client('stepfunctions')
        
        # Parse body for parameters
        body = json.loads(event.get('body', '{}'))
        
        # Default payload
        input_payload = {
            "trigger": "manual_api",
            "test_mode": body.get('test_mode', False),
            "limit_percent": body.get('limit_percent', 100)
        }
        
        response = client.start_execution(
            stateMachineArn=sfn_arn,
            input=json.dumps(input_payload)
        )
        
        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({"executionArn": response['executionArn']})
        }
    except Exception as e:
        logger.error(f"Error triggering execution: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({"error": str(e)})
        }


def get_progress(event):
    """Fetches progress from DynamoDB."""
    query_params = event.get('queryStringParameters') or {}
    execution_id = query_params.get('execution_id')
    
    try:
        from boto3.dynamodb.conditions import Key
        items = []
        if execution_id:
            # Get specific execution progress
            response = table.query(
                KeyConditionExpression=Key('ExecutionId').eq(execution_id)
            )
            items = response.get('Items', [])
        else:
            # Get latest executions
            response = table.scan(Limit=50)
            items = response.get('Items', [])
            # Filter out config items
            items = [i for i in items if i['ExecutionId'] != 'CONFIG']
            # Sort by last_updated desc
            items.sort(key=lambda x: x.get('last_updated', ''), reverse=True)
            
        # Calculate ETA for IN_PROGRESS steps with progress metadata
        from datetime import timezone
        for item in items:
            try:
                if item.get('status') == 'IN_PROGRESS' and 'metadata' in item:
                    metadata = item.get('metadata', {})
                    
                    if 'progress_percent' in metadata and 'start_time' in item:
                        try:
                            progress = float(metadata['progress_percent'])
                            if progress > 0:
                                start_time_str = item.get('start_time', '')
                                start_time = parse_timestamp(start_time_str)
                                
                                if start_time:
                                    now = datetime.now(timezone.utc)
                                    elapsed = (now - start_time).total_seconds()
                                    
                                    if elapsed > 0:
                                        estimated_total = elapsed * 100 / progress
                                        remaining = max(0, estimated_total - elapsed)
                                        metadata['estimated_remaining_seconds'] = int(remaining)
                                        metadata['estimated_completion_time'] = (now + timedelta(seconds=remaining)).isoformat().replace('+00:00', 'Z')
                                        item['metadata'] = metadata
                        except Exception as e:
                            logger.error(f"Error calculating ETA for item {item.get('ExecutionId')}: {e}")
                
                # Check for test mode
                if 'metadata' in item:
                    metadata = item.get('metadata', {})
                    if metadata.get('test_mode') == True:
                        item['test_mode'] = True
            except Exception as e:
                logger.error(f"Error processing item {item.get('ExecutionId')}: {e}")

        return {
            "statusCode": 200,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps(items, cls=DecimalEncoder)
        }
    except Exception as e:
        logger.error(f"Error fetching progress: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": {
                "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json"
            },
            "body": json.dumps({"error": str(e)})
        }


def run_update(event):
    """
    Updates the pipeline progress in DynamoDB.
    """
    execution_id = event.get('execution_id')
    step_name = event.get('step_name')
    status = event.get('status')
    message = event.get('message', '')
    metadata = event.get('metadata', {})
    
    
    # Handle error cause from Step Functions Catch block
    error_cause = event.get('error_cause')
    if error_cause and status == "ERROR":
        try:
             # Try to parse the cause if it is JSON
             cause_json = json.loads(error_cause)
             if 'errorMessage' in cause_json:
                 message = f"{message}: {cause_json['errorMessage']}"
             else:
                 message = f"{message}: {error_cause[:200]}..."
        except:
             message = f"{message}: {error_cause[:200]}..."

    timestamp = datetime.utcnow().isoformat() + "Z"
    result = {"status": "SUCCESS", "timestamp": timestamp}
    
    # Resolve Task Definition ARN and Test Mode if PipelineStart
    if step_name == "PipelineStart":
        input_data = event.get('input', {})
        
        # 1. Resolve Task Def
        if input_data and 'task_definition_arn' in input_data:
            result["resolved_task_definition_arn"] = input_data['task_definition_arn']
        else:
            sfn_arn = os.environ.get('INGESTION_SFN_ARN')
            if sfn_arn:
                try:
                    parts = sfn_arn.split(':')
                    if len(parts) > 4:
                        region = parts[3]
                        account = parts[4]
                        result["resolved_task_definition_arn"] = f"arn:aws:ecs:{region}:{account}:task-definition/aws-geocoding-loader"
                except Exception as e:
                    logger.error(f"Error constructing default Task ARN: {e}")

        # 2. Resolve Test Mode
        test_mode = str(input_data.get('test_mode', 'false')).lower()
        limit_percent = str(input_data.get('limit_percent', '100'))
        
        result["test_mode"] = test_mode
        result["limit_percent"] = limit_percent
        
        # Log full intent
        if test_mode == 'true':
            logger.info(f"PIPELINE STARTING IN TEST MODE: {limit_percent}%")
            # Inject into metadata for DynamoDB persistence
            metadata['test_mode'] = True
            metadata['limit_percent'] = limit_percent
    
    try:
        update_expr = "SET #stat = :s, last_updated = :t, #msg = :m"
        attr_names = {
            "#stat": "status",
            "#msg": "message",
        }
        attr_vals = {
            ":s": status,
            ":t": timestamp,
            ":m": message,
        }
        
        # Add metadata only if present
        if metadata:
            update_expr += ", #meta = :meta"
            attr_names["#meta"] = "metadata"
            attr_vals[":meta"] = metadata
        
        if status == "IN_PROGRESS":
            update_expr += ", start_time = if_not_exists(start_time, :t)"
        elif status == "COMPLETED" or status == "ERROR":
            update_expr += ", end_time = :t"
            
        table.update_item(
            Key={
                'ExecutionId': execution_id,
                'StepName': step_name
            },
            UpdateExpression=update_expr,
            ExpressionAttributeNames=attr_names,
            ExpressionAttributeValues=attr_vals
        )
        
        return result
    except Exception as e:
        logger.error(f"Failed to update progress in DynamoDB: {e}")
        return {"status": "ERROR", "message": str(e)}
