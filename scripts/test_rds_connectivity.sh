#!/bin/bash
# Test RDS Data API connectivity
# Usage: ./scripts/test_rds_connectivity.sh

CLUSTER_ARN="arn:aws:rds:ap-southeast-2:657416661258:cluster:aws-geocoding-aurora-cluster"
SECRET_ARN="arn:aws:secretsmanager:ap-southeast-2:657416661258:secret:rds!cluster-01d7b821-b23e-4643-b2b1-b613931aeac0-RNtoZt"
DATABASE="geocoder"

echo "Testing RDS Data API connectivity..."
echo ""

# Test 1: Simple query
echo "Test 1: Simple query (SELECT 1)"
aws rds-data execute-statement \
  --resource-arn "$CLUSTER_ARN" \
  --secret-arn "$SECRET_ARN" \
  --database "$DATABASE" \
  --sql "SELECT 1 as test" \
  --output json

echo ""
echo "---"
echo ""

# Test 2: Check gnaf table columns
echo "Test 2: Check gnaf table columns"
aws rds-data execute-statement \
  --resource-arn "$CLUSTER_ARN" \
  --secret-arn "$SECRET_ARN" \
  --database "$DATABASE" \
  --sql "SELECT column_name FROM information_schema.columns WHERE table_name = 'gnaf' ORDER BY ordinal_position" \
  --output json

echo ""
echo "---"
echo ""

# Test 3: Check if gnaf_all view exists
echo "Test 3: Check if gnaf_all view exists"
aws rds-data execute-statement \
  --resource-arn "$CLUSTER_ARN" \
  --secret-arn "$SECRET_ARN" \
  --database "$DATABASE" \
  --sql "SELECT table_name, table_type FROM information_schema.tables WHERE table_name = 'gnaf_all'" \
  --output json

echo ""
echo "---"
echo ""

# Test 4: Check gnaf_all view columns
echo "Test 4: Check gnaf_all view columns"
aws rds-data execute-statement \
  --resource-arn "$CLUSTER_ARN" \
  --secret-arn "$SECRET_ARN" \
  --database "$DATABASE" \
  --sql "SELECT column_name FROM information_schema.columns WHERE table_name = 'gnaf_all' ORDER BY ordinal_position" \
  --output json

echo ""
echo "Connectivity tests complete."
