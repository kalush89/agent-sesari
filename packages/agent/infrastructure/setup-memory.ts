#!/usr/bin/env node
/**
 * Infrastructure Setup Script for Recursive Memory (Agentic RAG)
 * 
 * Creates S3 bucket with folder structure and Bedrock Knowledge Base with S3 data source.
 * Run with: npx ts-node infrastructure/setup-memory.ts
 */

import {
  S3Client,
  CreateBucketCommand,
  PutObjectCommand,
  HeadBucketCommand,
  PutBucketVersioningCommand,
} from '@aws-sdk/client-s3';
import {
  BedrockAgentClient,
  CreateKnowledgeBaseCommand,
  CreateDataSourceCommand,
  GetKnowledgeBaseCommand,
} from '@aws-sdk/client-bedrock-agent';
import {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  PutRolePolicyCommand,
  GetRoleCommand,
} from '@aws-sdk/client-iam';
import { randomBytes } from 'crypto';

interface MemorySetupConfig {
  region: string;
  bucketName: string;
  knowledgeBaseName: string;
  knowledgeBaseRoleName: string;
  embeddingModel: string;
}

interface SetupResult {
  bucketName: string;
  knowledgeBaseId: string;
  dataSourceId: string;
  region: string;
  embeddingModel: string;
}

/**
 * Generate a unique suffix for bucket naming
 */
function generateUniqueSuffix(): string {
  return randomBytes(4).toString('hex');
}

/**
 * Creates S3 bucket with folder structure for memory documents
 */
async function createMemoryBucket(config: MemorySetupConfig): Promise<void> {
  const s3Client = new S3Client({ region: config.region });

  // Check if bucket exists
  try {
    await s3Client.send(new HeadBucketCommand({ Bucket: config.bucketName }));
    console.log('S3 bucket already exists:', config.bucketName);
    return;
  } catch (error) {
    // Bucket doesn't exist, create it
  }

  // Create bucket
  try {
    await s3Client.send(
      new CreateBucketCommand({
        Bucket: config.bucketName,
      })
    );
    console.log('S3 bucket created:', config.bucketName);
  } catch (error) {
    console.error('Failed to create S3 bucket:', error);
    throw error;
  }

  // Enable versioning
  await s3Client.send(
    new PutBucketVersioningCommand({
      Bucket: config.bucketName,
      VersioningConfiguration: {
        Status: 'Enabled',
      },
    })
  );
  console.log('Bucket versioning enabled');

  // Create folder structure by uploading placeholder objects
  const folders = ['strategy/', 'performance/', 'actions/', 'technical/'];
  
  for (const folder of folders) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: folder,
        Body: '',
      })
    );
  }
  
  console.log('Folder structure created:', folders.join(', '));
}

/**
 * Creates IAM role for Bedrock Knowledge Base
 */
async function createKnowledgeBaseRole(
  config: MemorySetupConfig,
  uniqueSuffix: string
): Promise<string> {
  const iamClient = new IAMClient({ region: config.region });

  // Check if role exists
  try {
    const existingRole = await iamClient.send(
      new GetRoleCommand({ RoleName: config.knowledgeBaseRoleName })
    );
    const roleArn = existingRole.Role?.Arn;
    if (!roleArn) {
      throw new Error('Role exists but ARN is missing');
    }
    console.log('IAM role already exists:', roleArn);
    return roleArn;
  } catch (error) {
    // Role doesn't exist, create it
  }

  // Create role with trust policy for Bedrock
  const assumeRolePolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Service: 'bedrock.amazonaws.com' },
        Action: 'sts:AssumeRole',
      },
    ],
  };

  const createRoleResponse = await iamClient.send(
    new CreateRoleCommand({
      RoleName: config.knowledgeBaseRoleName,
      AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy),
      Description: 'Execution role for Bedrock Knowledge Base to access S3',
    })
  );

  const newRoleArn = createRoleResponse.Role?.Arn;
  if (!newRoleArn) {
    throw new Error('Failed to create role: ARN is missing');
  }
  console.log('IAM role created:', newRoleArn);

  // Create inline policy for S3 access
  const inlinePolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: [
          's3:GetObject',
          's3:ListBucket',
        ],
        Resource: [
          `arn:aws:s3:::${config.bucketName}`,
          `arn:aws:s3:::${config.bucketName}/*`,
        ],
      },
      {
        Effect: 'Allow',
        Action: [
          'bedrock:InvokeModel',
        ],
        Resource: `arn:aws:bedrock:${config.region}::foundation-model/${config.embeddingModel}`,
      },
    ],
  };

  await iamClient.send(
    new PutRolePolicyCommand({
      RoleName: config.knowledgeBaseRoleName,
      PolicyName: 'bedrock-kb-s3-access',
      PolicyDocument: JSON.stringify(inlinePolicy),
    })
  );

  console.log('IAM policies attached');

  return newRoleArn;
}

/**
 * Creates Bedrock Knowledge Base with S3 data source
 */
async function createKnowledgeBase(
  config: MemorySetupConfig,
  roleArn: string
): Promise<{ knowledgeBaseId: string; dataSourceId: string }> {
  const bedrockClient = new BedrockAgentClient({ region: config.region });

  // Create Knowledge Base with managed storage (no OpenSearch collection needed)
  let knowledgeBaseId: string;
  
  try {
    const createKBResponse = await bedrockClient.send(
      new CreateKnowledgeBaseCommand({
        name: config.knowledgeBaseName,
        description: 'Vector store for Sesari agent memory (strategies, performance, actions, technical maps)',
        roleArn: roleArn,
        knowledgeBaseConfiguration: {
          type: 'VECTOR',
          vectorKnowledgeBaseConfiguration: {
            embeddingModelArn: `arn:aws:bedrock:${config.region}::foundation-model/${config.embeddingModel}`,
          },
        },
        storageConfiguration: {
          type: 'OPENSEARCH_SERVERLESS',
          opensearchServerlessConfiguration: {
            collectionArn: `arn:aws:aoss:${config.region}:*:collection/*`,
            vectorIndexName: 'sesari-memory-index',
            fieldMapping: {
              vectorField: 'embedding',
              textField: 'text',
              metadataField: 'metadata',
            },
          },
        },
      })
    );

    knowledgeBaseId = createKBResponse.knowledgeBase?.knowledgeBaseId ?? '';
    if (!knowledgeBaseId) {
      throw new Error('Failed to create Knowledge Base: ID is missing');
    }
    console.log('Bedrock Knowledge Base created:', knowledgeBaseId);
  } catch (error) {
    console.error('Failed to create Knowledge Base:', error);
    throw error;
  }

  // Wait for Knowledge Base to be ready
  console.log('Waiting for Knowledge Base to be ready...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Create S3 Data Source
  let dataSourceId: string;
  
  try {
    const createDSResponse = await bedrockClient.send(
      new CreateDataSourceCommand({
        knowledgeBaseId: knowledgeBaseId,
        name: 'sesari-memory-s3-source',
        description: 'S3 bucket containing memory documents',
        dataSourceConfiguration: {
          type: 'S3',
          s3Configuration: {
            bucketArn: `arn:aws:s3:::${config.bucketName}`,
            inclusionPrefixes: ['strategy/', 'performance/', 'actions/', 'technical/'],
          },
        },
        vectorIngestionConfiguration: {
          chunkingConfiguration: {
            chunkingStrategy: 'FIXED_SIZE',
            fixedSizeChunkingConfiguration: {
              maxTokens: 512,
              overlapPercentage: 20,
            },
          },
        },
      })
    );

    dataSourceId = createDSResponse.dataSource?.dataSourceId ?? '';
    if (!dataSourceId) {
      throw new Error('Failed to create Data Source: ID is missing');
    }
    console.log('S3 Data Source created:', dataSourceId);
  } catch (error) {
    console.error('Failed to create Data Source:', error);
    throw error;
  }

  return { knowledgeBaseId, dataSourceId };
}

/**
 * Main setup function
 */
async function setupMemoryInfrastructure(): Promise<SetupResult> {
  console.log('Starting Recursive Memory infrastructure setup...\n');

  const uniqueSuffix = generateUniqueSuffix();
  
  const config: MemorySetupConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    bucketName: process.env.MEMORY_S3_BUCKET_NAME || `sesari-memory-${uniqueSuffix}`,
    knowledgeBaseName: 'sesari-memory-kb',
    knowledgeBaseRoleName: 'sesari-memory-kb-role',
    embeddingModel: 'amazon.nova-lite-v1:0',
  };

  try {
    // Step 1: Create S3 bucket with folder structure
    console.log('Step 1: Creating S3 bucket...');
    await createMemoryBucket(config);

    // Step 2: Create IAM role for Knowledge Base
    console.log('\nStep 2: Creating IAM role for Knowledge Base...');
    const roleArn = await createKnowledgeBaseRole(config, uniqueSuffix);
    
    // Wait for IAM role to propagate
    console.log('Waiting for IAM role to propagate...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Step 3: Create Bedrock Knowledge Base and Data Source
    console.log('\nStep 3: Creating Bedrock Knowledge Base...');
    const { knowledgeBaseId, dataSourceId } = await createKnowledgeBase(config, roleArn);

    const result: SetupResult = {
      bucketName: config.bucketName,
      knowledgeBaseId,
      dataSourceId,
      region: config.region,
      embeddingModel: config.embeddingModel,
    };

    console.log('\n✅ Infrastructure setup completed successfully!');
    console.log('\n📋 Configuration values (add to .env):');
    console.log(`MEMORY_S3_BUCKET_NAME=${result.bucketName}`);
    console.log(`MEMORY_BEDROCK_KB_ID=${result.knowledgeBaseId}`);
    console.log(`MEMORY_BEDROCK_DATA_SOURCE_ID=${result.dataSourceId}`);
    console.log(`AWS_REGION=${result.region}`);
    console.log(`MEMORY_EMBEDDING_MODEL=${result.embeddingModel}`);
    
    console.log('\n📝 Next steps:');
    console.log('1. Add the configuration values above to packages/agent/.env');
    console.log('2. Test document storage with memory-store module');
    console.log('3. Verify Knowledge Base sync with memory-retrieval module');

    return result;
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run setup if executed directly
if (require.main === module) {
  setupMemoryInfrastructure();
}

export type { MemorySetupConfig, SetupResult };
export { setupMemoryInfrastructure };
