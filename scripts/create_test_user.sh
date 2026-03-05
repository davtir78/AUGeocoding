#!/bin/bash
# create_test_user.sh — Create a test user in the Cognito User Pool
# Usage: ./scripts/create_test_user.sh <email> <password>

set -euo pipefail

REGION="ap-southeast-2"

# Get Cognito User Pool ID from Terraform state
# Handles being run from scripts/ or project root
PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
USER_POOL_ID=$(cd "$PROJECT_ROOT/terraform" && terraform output -raw user_pool_id 2>/dev/null || echo "")

if [ -z "$USER_POOL_ID" ]; then
    echo "ERROR: Could not get User Pool ID from Terraform output."
    echo "Make sure 'cognito_user_pool_id' is defined in outputs.tf and terraform has been applied."
    exit 1
fi

EMAIL="${1:?Usage: $0 <email> <password>}"
PASSWORD="${2:?Usage: $0 <email> <password>}"

echo "Creating user: $EMAIL in pool: $USER_POOL_ID"

# Create the user
aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL" \
    --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true Name=name,Value="Test User" \
    --temporary-password "$PASSWORD" \
    --message-action SUPPRESS \
    --region "$REGION"

# Set permanent password (skip the force-change flow)
aws cognito-idp admin-set-user-password \
    --user-pool-id "$USER_POOL_ID" \
    --username "$EMAIL" \
    --password "$PASSWORD" \
    --permanent \
    --region "$REGION"

echo ""
echo "✅ User created and confirmed: $EMAIL"
echo ""
echo "To get a JWT token programmatically:"
echo ""
echo "  CLIENT_ID=\$(cd "$PROJECT_ROOT/terraform" && terraform output -raw user_pool_client_id)"
echo "  aws cognito-idp initiate-auth \\"
echo "    --client-id \$CLIENT_ID \\"
echo "    --auth-flow USER_PASSWORD_AUTH \\"
echo "    --auth-parameters USERNAME=$EMAIL,PASSWORD=<password> \\"
echo "    --region $REGION"
