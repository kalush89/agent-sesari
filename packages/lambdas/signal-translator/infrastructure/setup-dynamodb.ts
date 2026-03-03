/**
 * DynamoDB table setup for Universal Signal Schema
 * 
 * Creates UniversalSignals and EntityMappings tables with appropriate indexes
 */

import {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  BillingMode,
} from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * Create UniversalSignals table
 */
async function createUniversalSignalsTable(): Promise<void> {
  const tableName = 'UniversalSignals';

  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`Table ${tableName} already exists`);
    return;
  } catch (error) {
    // Table doesn't exist, create it
  }

  console.log(`Creating table ${tableName}...`);

  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: BillingMode.PAY_PER_REQUEST,
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
        { AttributeName: 'GSI2PK', AttributeType: 'S' },
        { AttributeName: 'GSI2SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'SignalTypeIndex',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
        {
          IndexName: 'CategoryIndex',
          KeySchema: [
            { AttributeName: 'GSI2PK', KeyType: 'HASH' },
            { AttributeName: 'GSI2SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
      TimeToLiveSpecification: {
        Enabled: true,
        AttributeName: 'ttl',
      },
    })
  );

  console.log(`Table ${tableName} created successfully`);
}

/**
 * Create EntityMappings table
 */
async function createEntityMappingsTable(): Promise<void> {
  const tableName = 'EntityMappings';

  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`Table ${tableName} already exists`);
    return;
  } catch (error) {
    // Table doesn't exist, create it
  }

  console.log(`Creating table ${tableName}...`);

  await client.send(
    new CreateTableCommand({
      TableName: tableName,
      BillingMode: BillingMode.PAY_PER_REQUEST,
      AttributeDefinitions: [
        { AttributeName: 'PK', AttributeType: 'S' },
        { AttributeName: 'SK', AttributeType: 'S' },
        { AttributeName: 'GSI1PK', AttributeType: 'S' },
        { AttributeName: 'GSI1SK', AttributeType: 'S' },
      ],
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: 'PlatformIdIndex',
          KeySchema: [
            { AttributeName: 'GSI1PK', KeyType: 'HASH' },
            { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    })
  );

  console.log(`Table ${tableName} created successfully`);
}

/**
 * Main setup function
 */
async function main(): Promise<void> {
  try {
    await createUniversalSignalsTable();
    await createEntityMappingsTable();
    console.log('All tables created successfully');
  } catch (error) {
    console.error('Failed to create tables:', error);
    process.exit(1);
  }
}

main();
