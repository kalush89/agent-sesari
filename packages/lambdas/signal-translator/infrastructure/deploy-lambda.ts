/**
 * Lambda deployment script for Universal Signal Translator
 * 
 * Deploys the Lambda function with DynamoDB Stream triggers
 */

import {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  CreateEventSourceMappingCommand,
  ListEventSourceMappingsCommand,
} from '@aws-sdk/client-lambda';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const client = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });

const FUNCTION_NAME = 'signal-translator';
const HANDLER = 'index.handler';
const RUNTIME = 'nodejs20.x';
const TIMEOUT = 60;
const MEMORY_SIZE = 512;

/**
 * Build and package Lambda function
 */
function buildLambda(): Buffer {
  console.log('Building Lambda function...');
  
  execSync('npm run build', { cwd: process.cwd(), stdio: 'inherit' });
  execSync('npm ci --production', { cwd: process.cwd(), stdio: 'inherit' });
  
  // Create deployment package
  execSync(
    'zip -r deployment.zip dist node_modules',
    { cwd: process.cwd(), stdio: 'inherit' }
  );
  
  return readFileSync('deployment.zip');
}

/**
 * Deploy or update Lambda function
 */
async function deployLambda(): Promise<void> {
  const zipFile = buildLambda();
  
  try {
    await client.send(new GetFunctionCommand({ FunctionName: FUNCTION_NAME }));
    console.log('Function exists, updating...');
    
    await client.send(
      new UpdateFunctionCodeCommand({
        FunctionName: FUNCTION_NAME,
        ZipFile: zipFile,
      })
    );
    
    await client.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: FUNCTION_NAME,
        Handler: HANDLER,
        Runtime: RUNTIME,
        Timeout: TIMEOUT,
        MemorySize: MEMORY_SIZE,
        Environment: {
          Variables: {
            AWS_REGION: process.env.AWS_REGION || 'us-east-1',
            UNIVERSAL_SIGNALS_TABLE: 'UniversalSignals',
            ENTITY_MAPPINGS_TABLE: 'EntityMappings',
            SIGNAL_TTL_DAYS: '90',
          },
        },
      })
    );
    
    console.log('Function updated successfully');
  } catch (error) {
    console.log('Function does not exist, creating...');
    
    await client.send(
      new CreateFunctionCommand({
        FunctionName: FUNCTION_NAME,
        Runtime: RUNTIME,
        Role: process.env.LAMBDA_ROLE_ARN!,
        Handler: HANDLER,
        Code: { ZipFile: zipFile },
        Timeout: TIMEOUT,
        MemorySize: MEMORY_SIZE,
        Environment: {
          Variables: {
            AWS_REGION: process.env.AWS_REGION || 'us-east-1',
            UNIVERSAL_SIGNALS_TABLE: 'UniversalSignals',
            ENTITY_MAPPINGS_TABLE: 'EntityMappings',
            SIGNAL_TTL_DAYS: '90',
          },
        },
      })
    );
    
    console.log('Function created successfully');
  }
}

/**
 * Configure DynamoDB Stream triggers
 */
async function configureTriggers(): Promise<void> {
  const streamArns = [
    process.env.STRIPE_STREAM_ARN,
    process.env.HUBSPOT_STREAM_ARN,
    process.env.MIXPANEL_STREAM_ARN,
  ].filter(Boolean);
  
  if (streamArns.length === 0) {
    console.log('No stream ARNs provided, skipping trigger configuration');
    return;
  }
  
  for (const streamArn of streamArns) {
    const existing = await client.send(
      new ListEventSourceMappingsCommand({
        FunctionName: FUNCTION_NAME,
        EventSourceArn: streamArn,
      })
    );
    
    if (existing.EventSourceMappings && existing.EventSourceMappings.length > 0) {
      console.log(`Trigger already exists for ${streamArn}`);
      continue;
    }
    
    await client.send(
      new CreateEventSourceMappingCommand({
        FunctionName: FUNCTION_NAME,
        EventSourceArn: streamArn,
        StartingPosition: 'LATEST',
        BatchSize: 10,
        MaximumBatchingWindowInSeconds: 5,
      })
    );
    
    console.log(`Trigger configured for ${streamArn}`);
  }
}

/**
 * Main deployment function
 */
async function main(): Promise<void> {
  try {
    if (!process.env.LAMBDA_ROLE_ARN) {
      throw new Error('LAMBDA_ROLE_ARN environment variable is required');
    }
    
    await deployLambda();
    await configureTriggers();
    
    console.log('Deployment complete');
  } catch (error) {
    console.error('Deployment failed:', error);
    process.exit(1);
  }
}

main();
