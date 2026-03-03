import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTimeToLiveCommand,
} from '@aws-sdk/client-dynamodb';

/**
 * Creates the DynamoDB table for relationship signal events
 */
async function createRelationshipSignalsTable(
  tableName: string,
  region: string
): Promise<void> {
  const client = new DynamoDBClient({ region });

  try {
    // Check if table already exists
    try {
      await client.send(new DescribeTableCommand({ TableName: tableName }));
      console.log(`Table ${tableName} already exists. Skipping creation.`);
      return;
    } catch (error: any) {
      if (error.name !== 'ResourceNotFoundException') {
        throw error;
      }
      // Table doesn't exist, proceed with creation
    }

    // Create table with eventId primary key and GSI for company queries
    const createTableCommand = new CreateTableCommand({
      TableName: tableName,
      BillingMode: 'PAY_PER_REQUEST', // On-demand pricing for Free Tier compliance
      AttributeDefinitions: [
        { AttributeName: 'eventId', AttributeType: 'S' },
        { AttributeName: 'companyId', AttributeType: 'S' },
        { AttributeName: 'timestamp', AttributeType: 'N' },
      ],
      KeySchema: [{ AttributeName: 'eventId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'companyId-timestamp-index',
          KeySchema: [
            { AttributeName: 'companyId', KeyType: 'HASH' },
            { AttributeName: 'timestamp', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    });

    await client.send(createTableCommand);
    console.log(`Table ${tableName} created successfully.`);

    // Wait for table to become active
    await waitForTableActive(client, tableName);

    // Enable TTL for 90-day retention
    await enableTTL(client, tableName);
  } catch (error) {
    console.error('Failed to create DynamoDB table:', error);
    throw error;
  }
}

/**
 * Waits for the DynamoDB table to become active
 */
async function waitForTableActive(
  client: DynamoDBClient,
  tableName: string
): Promise<void> {
  const maxAttempts = 30;
  const delayMs = 2000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const response = await client.send(
      new DescribeTableCommand({ TableName: tableName })
    );

    if (response.Table?.TableStatus === 'ACTIVE') {
      console.log(`Table ${tableName} is now active.`);
      return;
    }

    console.log(
      `Waiting for table to become active... (${attempt + 1}/${maxAttempts})`
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error(`Table ${tableName} did not become active within timeout.`);
}

/**
 * Enables TTL on the DynamoDB table for 90-day retention
 */
async function enableTTL(
  client: DynamoDBClient,
  tableName: string
): Promise<void> {
  try {
    await client.send(
      new UpdateTimeToLiveCommand({
        TableName: tableName,
        TimeToLiveSpecification: {
          Enabled: true,
          AttributeName: 'ttl',
        },
      })
    );
    console.log(`TTL enabled on ${tableName} with attribute 'ttl'.`);
  } catch (error) {
    console.error('Failed to enable TTL:', error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  const tableName = process.env.DYNAMODB_TABLE_NAME || 'relationship-signals';
  const region = process.env.AWS_REGION || 'us-east-1';

  console.log(`Setting up DynamoDB table: ${tableName} in region: ${region}`);

  await createRelationshipSignalsTable(tableName, region);

  console.log('DynamoDB setup complete!');
}

main().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
