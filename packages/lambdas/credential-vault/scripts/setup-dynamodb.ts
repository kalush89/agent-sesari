#!/usr/bin/env node
/**
 * DynamoDB Table Setup Script
 * 
 * Creates the sesari-credentials table with:
 * - Composite primary key (user_id + service_name)
 * - PAY_PER_REQUEST billing mode for Free Tier compliance
 * 
 * Requirements: 1.1, 1.5, 10.1, 10.2
 */

import { 
  DynamoDBClient, 
  CreateTableCommand, 
  DescribeTableCommand,
  ResourceInUseException 
} from '@aws-sdk/client-dynamodb';

const TABLE_NAME = 'sesari-credentials';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

/**
 * Creates the DynamoDB credentials table
 */
async function createCredentialsTable(): Promise<void> {
  const client = new DynamoDBClient({ region: AWS_REGION });

  try {
    // Check if table already exists
    try {
      await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
      console.log(`✓ Table "${TABLE_NAME}" already exists`);
      return;
    } catch (error: any) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error;
      }
    }

    // Create table
    console.log(`Creating table "${TABLE_NAME}"...`);
    
    await client.send(new CreateTableCommand({
      TableName: TABLE_NAME,
      KeySchema: [
        { AttributeName: 'user_id', KeyType: 'HASH' },      // Partition key
        { AttributeName: 'service_name', KeyType: 'RANGE' }  // Sort key
      ],
      AttributeDefinitions: [
        { AttributeName: 'user_id', AttributeType: 'S' },
        { AttributeName: 'service_name', AttributeType: 'S' }
      ],
      BillingMode: 'PAY_PER_REQUEST',  // Free Tier compliant
      Tags: [
        { Key: 'Project', Value: 'Sesari' },
        { Key: 'Component', Value: 'CredentialVault' }
      ]
    }));

    console.log(`✓ Table "${TABLE_NAME}" created successfully`);
    console.log('  - Partition Key: user_id (String)');
    console.log('  - Sort Key: service_name (String)');
    console.log('  - Billing Mode: PAY_PER_REQUEST');
    
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      console.log(`✓ Table "${TABLE_NAME}" already exists`);
      return;
    }
    
    console.error('Failed to create DynamoDB table:', error);
    throw new Error(`DynamoDB table creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Execute if run directly
if (require.main === module) {
  createCredentialsTable()
    .then(() => {
      console.log('\n✓ DynamoDB setup complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ DynamoDB setup failed:', error.message);
      process.exit(1);
    });
}

export { createCredentialsTable };
