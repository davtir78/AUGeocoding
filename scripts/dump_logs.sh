#!/bin/bash
# scripts/dump_logs.sh
# Usage: ./scripts/dump_logs.sh <log-group-name> [limit]

LOG_GROUP=$1
LIMIT=${2:-100}

if [ -z "$LOG_GROUP" ]; then
    echo "Usage: ./scripts/dump_logs.sh <log-group-name> [limit]"
    exit 1
fi

TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
TODAY=$(date +"%Y-%m-%d")
LOG_DIR="logs/$TODAY"
mkdir -p "$LOG_DIR"

SAFE_NAME=$(echo "$LOG_GROUP" | sed 's/[^a-zA-Z0-9]/_/g')
OUTPUT_FILE="$LOG_DIR/${SAFE_NAME}_${TIMESTAMP}.txt"

echo "Dumping logs for group: $LOG_GROUP (Limit: $LIMIT)" | tee -a "$OUTPUT_FILE"

# Get latest stream
LOG_STREAM=$(aws logs describe-log-streams --log-group-name "$LOG_GROUP" --order-by LastEventTime --descending --limit 1 --query "logStreams[0].logStreamName" --output text)

if [ "$LOG_STREAM" != "None" ]; then
    echo "Log Stream: $LOG_STREAM" | tee -a "$OUTPUT_FILE"
    aws logs get-log-events --log-group-name "$LOG_GROUP" --log-stream-name "$LOG_STREAM" --limit "$LIMIT" --query "events[*].[timestamp, message]" --output text >> "$OUTPUT_FILE" 2>&1
    echo "Logs saved to $OUTPUT_FILE"
else
    echo "No log streams found for group $LOG_GROUP" | tee -a "$OUTPUT_FILE"
fi
