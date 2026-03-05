#!/bin/bash
# Enhanced status check for AWS Geocoding Pipeline

export MSYS_NO_PATHCONV=1

ARN=$1
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
STATE_FILE="$SCRIPT_DIR/active_execution_arn.txt"

if [ -z "$ARN" ]; then
    if [ -f "$STATE_FILE" ]; then
        ARN=$(cat "$STATE_FILE")
        echo "Using execution ARN from file: $ARN"
    else
        echo "Error: No execution ARN provided and $STATE_FILE not found."
        exit 1
    fi
fi

echo "=================================================="
echo "Pipeline Status Report"
echo "=================================================="
echo "Execution ARN: $ARN"
echo "Report Time: $(date)"
echo ""

# 1. Get Execution Status
echo "--------------------------------------------------"
echo "1. EXECUTION STATUS"
echo "--------------------------------------------------"
STATUS=$(aws stepfunctions describe-execution --execution-arn "$ARN" --query 'status' --output text)
START_DATE=$(aws stepfunctions describe-execution --execution-arn "$ARN" --query 'startDate' --output text)
STOP_DATE=$(aws stepfunctions describe-execution --execution-arn "$ARN" --query 'stopDate' --output text)

echo "Status: $STATUS"
echo "Start Time: $START_DATE"
if [ "$STOP_DATE" != "None" ]; then
    echo "Stop Time: $STOP_DATE"
fi
echo ""

# 2. Get Current Step
echo "--------------------------------------------------"
echo "2. CURRENT STEP"
echo "--------------------------------------------------"
CURRENT_STEP=$(aws stepfunctions get-execution-history --execution-arn "$ARN" --max-items 1 --reverse-order --query 'events[0].stateEnteredEventDetails.name' --output text)
echo "Current Step: $CURRENT_STEP"
echo ""

# 3. Get Progress from DynamoDB
echo "--------------------------------------------------"
echo "3. PROGRESS DETAILS"
echo "--------------------------------------------------"
EXEC_ID=$(echo "$ARN" | awk -F':' '{print $NF}')
REGION=$(echo "$ARN" | awk -F':' '{print $4}')

PROGRESS_JSON=$(aws dynamodb query \
    --table-name aws-geocoding-pipeline-progress \
    --key-condition-expression "ExecutionId = :eid" \
    --expression-attribute-values "{\":eid\": {\"S\": \"$EXEC_ID\"}}" \
    --region "$REGION" \
    --output json)

echo "Steps:"
echo "$PROGRESS_JSON" | jq -r '.Items[] | "\(.StepName.S): \(.status.S) - \(.message.S // "")"'
echo ""

# 4. Check for detailed progress (ETA)
echo "--------------------------------------------------"
echo "4. DETAILED PROGRESS (if available)"
echo "--------------------------------------------------"

if echo "$PROGRESS_JSON" | jq -e '.Items[].metadata.M' > /dev/null 2>&1; then
    echo "$PROGRESS_JSON" | jq -r '.Items[] | select(.metadata.M) | "\(.StepName.S):\n  Progress: \(.metadata.M.progress_percent.N // "N/A")%\n  Processed: \(.metadata.M.records_processed.N // "N/A")\n"'
else
    echo "No detailed progress metadata available"
fi
echo ""

# 5. Recent ECS Logs
echo "--------------------------------------------------"
echo "5. RECENT ECS LOGS (Last 10 lines)"
echo "--------------------------------------------------"
# Try to find recent log streams
export MSYS2_ARG_CONV_EXCL="*"
LOG_STREAM=$(aws logs describe-log-streams --log-group-name "/ecs/aws-geocoding-loader" --order-by LastEventTime --descending --limit 1 --query "logStreams[0].logStreamName" --output text)
if [ "$LOG_STREAM" != "None" ]; then
    echo "Stream: $LOG_STREAM"
    aws logs get-log-events --log-group-name "/ecs/aws-geocoding-loader" --log-stream-name "$LOG_STREAM" --limit 10 --query "events[*].[timestamp, message]" --output text
else
    echo "No ECS log streams found."
fi
echo ""
