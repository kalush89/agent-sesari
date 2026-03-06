#!/bin/bash
# Deploy DynamoDB tables using CloudFormation
# Usage: ./deploy.sh [dev|prod]

set -e

ENVIRONMENT=${1:-dev}
STACK_NAME="growth-plays-dynamodb-${ENVIRONMENT}"

echo "Deploying DynamoDB tables for environment: ${ENVIRONMENT}"

aws cloudformation deploy \
  --template-file dynamodb-tables.yaml \
  --stack-name "${STACK_NAME}" \
  --parameter-overrides Environment="${ENVIRONMENT}" \
  --capabilities CAPABILITY_IAM \
  --no-fail-on-empty-changeset

echo "Deployment complete!"
echo "Stack outputs:"
aws cloudformation describe-stacks \
  --stack-name "${STACK_NAME}" \
  --query 'Stacks[0].Outputs' \
  --output table
