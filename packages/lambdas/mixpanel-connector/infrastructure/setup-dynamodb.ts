import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  UpdateTimeToLiveCommand,
} from '@aws-sdk/client-dynamodb';

/**
 * Creates the DynamoDB table for behavioral signal events
 */
async function createBehavioralSignalsTable(
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

    // Create table with eventId primary key and GSI for user queries
    const createTableCommand = new CreateTableCommand({
      TableName: tableName,
      BillingMode: 'PAY_PER_REQUEST', // On-demand pricing for Free Tier compliance
      AttributeDefinitions: [
        { AttributeName: 'eventId', AttributeType: 'S' },
        { AttributeName: 'userId', AttributeType: 'S' },
        { AttributeName: 'timestamp', AttributeType: 'N' },
      ],
      KeySchema: [{ AttributeName: 'eventId', KeyType: 'HASH' }],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'userId-timestamp-index',
          KeySchema: [
            { AttributeName: 'userId', KeyType: 'HASH' },
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
 * Creates the DynamoDB table for usage baselines
 */
async function createUsageBaselinesTable(
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

    // Create table with userFeatureKey primary key
    const createTableCommand = new CreateTableCommand({
      TableName: tableName,
      BillingMode: 'PAY_PER_REQUEST', // On-demand pricing for Free Tier compliance
      AttributeDefinitions: [
        { AttributeName: 'userFeatureKey', AttributeType: 'S' },
      ],
      KeySchema: [{ AttributeName: 'userFeatureKey', KeyType: 'HASH' }],
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
          AttributeName: 'expiresAt',
        },
      })
    );
    console.log(`TTL enabled on ${tableName} with attribute 'expiresAt'.`);
  } catch (error) {
    console.error('Failed to enable TTL:', error);
    throw error;
  }
}

/**
 * Main execution
 */
async function main() {
  const signalsTableName = process.env.DYNAMODB_SIGNALS_TABLE || 'behavioral-signals';
  const baselinesTableName = process.env.DYNAMODB_BASELINES_TABLE || 'usage-baselines';
  const region = process.env.AWS_REGION || 'us-east-1';

  console.log(`Setting up DynamoDB tables in region: ${region}`);
  console.log(`  - Signals table: ${signalsTableName}`);
  console.log(`  - Baselines table: ${baselinesTableName}`);

  await createBehavioralSignalsTable(signalsTableName, region);
  await createUsageBaselinesTable(baselinesTableName, region);

  console.log('\nDynamoDB setup complete!');
  console.log('\nTables created:');
  console.log(`  1. ${signalsTableName}`);
  console.log(`     - Primary key: eventId`);
  console.log(`     - GSI: userId-timestamp-index`);
  console.log(`     - TTL: expiresAt (90 days)`);
  console.log(`  2. ${baselinesTableName}`);
  console.log(`     - Primary key: userFeatureKey`);
  console.log(`     - TTL: expiresAt (90 days)`);
}

main().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
