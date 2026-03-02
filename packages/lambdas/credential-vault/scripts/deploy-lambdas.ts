#!/usr/bin/env node
/**
 * Lambda Deployment Script
 * 
 * Packages and deploys all credential vault Lambda functions:
 * - Stripe validation
 * - Mixpanel validation
 * - HubSpot OAuth handler
 * - Token refresh
 * - Credential retrieval
 * 
 * Requirements: 10.2
 */

import { 
  LambdaClient, 
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  ResourceNotFoundException
} from '@aws-sdk/client-lambda';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;
const KMS_KEY_ID = process.env.KMS_KEY_ID || 'alias/sesari-credential-vault';
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || 'sesari-credentials';

interface LambdaConfig {
  name: string;
  handler: string;
  description: string;
  timeout: number;
  memorySize: number;
  environment: Record<string, string>;
}

const LAMBDA_CONFIGS: LambdaConfig[] = [
  {
    name: 'sesari-stripe-validation',
    handler: 'handlers/stripe-validation.handler',
    description: 'Validates and stores Stripe API keys',
    timeout: 10,
    memorySize: 256,
    environment: {
      KMS_KEY_ID,
      CREDENTIAL_TABLE_NAME: DYNAMODB_TABLE,
      VALIDATION_TIMEOUT_MS: '5000'
    }
  },
  {
    name: 'sesari-mixpanel-validation',
    handler: 'handlers/mixpanel-validation.handler',
    description: 'Validates and stores Mixpanel service account credentials',
    timeout: 10,
    memorySize: 256,
    environment: {
      KMS_KEY_ID,
      CREDENTIAL_TABLE_NAME: DYNAMODB_TABLE,
      VALIDATION_TIMEOUT_MS: '5000'
    }
  },
  {
    name: 'sesari-hubspot-oauth',
    handler: 'handlers/hubspot-oauth.handler',
    description: 'Handles HubSpot OAuth flow and token exchange',
    timeout: 15,
    memorySize: 256,
    environment: {
      KMS_KEY_ID,
      CREDENTIAL_TABLE_NAME: DYNAMODB_TABLE,
      HUBSPOT_CLIENT_ID: process.env.HUBSPOT_CLIENT_ID || '',
      HUBSPOT_CLIENT_SECRET: process.env.HUBSPOT_CLIENT_SECRET || '',
      HUBSPOT_REDIRECT_URI: process.env.HUBSPOT_REDIRECT_URI || ''
    }
  },
  {
    name: 'sesari-token-refresh',
    handler: 'handlers/token-refresh.handler',
    description: 'Refreshes expired OAuth access tokens',
    timeout: 10,
    memorySize: 256,
    environment: {
      KMS_KEY_ID,
      CREDENTIAL_TABLE_NAME: DYNAMODB_TABLE,
      HUBSPOT_CLIENT_ID: process.env.HUBSPOT_CLIENT_ID || '',
      HUBSPOT_CLIENT_SECRET: process.env.HUBSPOT_CLIENT_SECRET || ''
    }
  },
  {
    name: 'sesari-credential-retrieval',
    handler: 'handlers/credential-retrieval.handler',
    description: 'Retrieves and decrypts credentials for agent use',
    timeout: 10,
    memorySize: 256,
    environment: {
      KMS_KEY_ID,
      CREDENTIAL_TABLE_NAME: DYNAMODB_TABLE
    }
  }
];

/**
 * Builds TypeScript code and packages Lambda function
 */
function buildAndPackage(): string {
  console.log('Building TypeScript code...');
  
  try {
    execSync('npm run build', { 
      cwd: join(__dirname, '..'),
      stdio: 'inherit' 
    });
  } catch (error) {
    throw new Error('TypeScript build failed');
  }

  console.log('Creating deployment package...');
  
  const zipPath = join(__dirname, '..', 'dist', 'lambda.zip');
  
  try {
    execSync(`cd dist && zip -r lambda.zip . -x "*.test.js" "*.test.d.ts"`, {
      cwd: join(__dirname, '..'),
      stdio: 'inherit'
    });
  } catch (error) {
    throw new Error('Package creation failed');
  }

  if (!existsSync(zipPath)) {
    throw new Error('Deployment package not found');
  }

  console.log(`✓ Deployment package created: ${zipPath}`);
  return zipPath;
}

/**
 * Checks if Lambda function exists
 */
async function functionExists(client: LambdaClient, functionName: string): Promise<boolean> {
  try {
    await client.send(new GetFunctionCommand({ FunctionName: functionName }));
    return true;
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      return false;
    }
    throw error;
  }
}

/**
 * Creates a new Lambda function
 */
async function createFunction(
  client: LambdaClient,
  config: LambdaConfig,
  zipBuffer: Buffer
): Promise<void> {
  if (!AWS_ACCOUNT_ID) {
    throw new Error('AWS_ACCOUNT_ID environment variable is required');
  }

  console.log(`Creating function "${config.name}"...`);

  await client.send(new CreateFunctionCommand({
    FunctionName: config.name,
    Runtime: 'nodejs20.x',
    Role: `arn:aws:iam::${AWS_ACCOUNT_ID}:role/sesari-credential-vault-lambda-role`,
    Handler: config.handler,
    Code: { ZipFile: zipBuffer },
    Description: config.description,
    Timeout: config.timeout,
    MemorySize: config.memorySize,
    Environment: {
      Variables: {
        ...config.environment,
        AWS_REGION,
        NODE_ENV: 'production'
      }
    },
    Tags: {
      Project: 'Sesari',
      Component: 'CredentialVault'
    }
  }));

  console.log(`✓ Function "${config.name}" created`);
}

/**
 * Updates existing Lambda function code and configuration
 */
async function updateFunction(
  client: LambdaClient,
  config: LambdaConfig,
  zipBuffer: Buffer
): Promise<void> {
  console.log(`Updating function "${config.name}"...`);

  // Update code
  await client.send(new UpdateFunctionCodeCommand({
    FunctionName: config.name,
    ZipFile: zipBuffer
  }));

  // Update configuration
  await client.send(new UpdateFunctionConfigurationCommand({
    FunctionName: config.name,
    Timeout: config.timeout,
    MemorySize: config.memorySize,
    Environment: {
      Variables: {
        ...config.environment,
        AWS_REGION,
        NODE_ENV: 'production'
      }
    }
  }));

  console.log(`✓ Function "${config.name}" updated`);
}

/**
 * Deploys all Lambda functions
 */
async function deployLambdas(): Promise<void> {
  if (!AWS_ACCOUNT_ID) {
    throw new Error('AWS_ACCOUNT_ID environment variable is required');
  }

  console.log('Starting Lambda deployment...\n');

  // Build and package
  const zipPath = buildAndPackage();
  const zipBuffer = readFileSync(zipPath);

  const client = new LambdaClient({ region: AWS_REGION });

  // Deploy each function
  for (const config of LAMBDA_CONFIGS) {
    try {
      const exists = await functionExists(client, config.name);

      if (exists) {
        await updateFunction(client, config, zipBuffer);
      } else {
        await createFunction(client, config, zipBuffer);
      }

      console.log(`  Handler: ${config.handler}`);
      console.log(`  Timeout: ${config.timeout}s`);
      console.log(`  Memory: ${config.memorySize}MB\n`);
    } catch (error) {
      console.error(`Failed to deploy "${config.name}":`, error);
      throw error;
    }
  }

  console.log('✓ All Lambda functions deployed successfully');
}

// Execute if run directly
if (require.main === module) {
  deployLambdas()
    .then(() => {
      console.log('\n✓ Lambda deployment complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ Lambda deployment failed:', error.message);
      process.exit(1);
    });
}

export { deployLambdas };
