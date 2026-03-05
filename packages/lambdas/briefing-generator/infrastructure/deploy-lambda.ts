/**
 * Lambda deployment script for Daily Briefing Generator
 * 
 * Deploys the Lambda function with proper IAM role and configuration
 * for scheduled execution via EventBridge
 */

import {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
} from '@aws-sdk/client-lambda';
import {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  GetRoleCommand,
  PutRolePolicyCommand,
} from '@aws-sdk/client-iam';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Creates or retrieves the IAM role for the Lambda function
 */
async function ensureLambdaRole(
  iamClient: IAMClient,
  roleName: string,
  signalsTableName: string,
  briefingsTableName: string
): Promise<string> {
  try {
    const response = await iamClient.send(
      new GetRoleCommand({ RoleName: roleName })
    );
    console.log(`IAM role ${roleName} already exists.`);
    return response.Role!.Arn;
  } catch (error: any) {
    if (error.name !== 'NoSuchEntity') {
      throw error;
    }
  }

  // Create role with Lambda trust policy
  const trustPolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: { Service: 'lambda.amazonaws.com' },
        Action: 'sts:AssumeRole',
      },
    ],
  };

  const createRoleResponse = await iamClient.send(
    new CreateRoleCommand({
      RoleName: roleName,
      AssumeRolePolicyDocument: JSON.stringify(trustPolicy),
      Description: 'Execution role for Daily Briefing Generator Lambda',
    })
  );

  console.log(`Created IAM role: ${roleName}`);

  // Attach AWS managed policy for Lambda basic execution (CloudWatch Logs)
  await iamClient.send(
    new AttachRolePolicyCommand({
      RoleName: roleName,
      PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    })
  );

  // Add inline policy for DynamoDB, Bedrock, and CloudWatch
  const inlinePolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: [
          'dynamodb:Query',
          'dynamodb:GetItem',
        ],
        Resource: [
          `arn:aws:dynamodb:*:*:table/${signalsTableName}`,
          `arn:aws:dynamodb:*:*:table/${signalsTableName}/index/*`,
        ],
      },
      {
        Effect: 'Allow',
        Action: [
          'dynamodb:PutItem',
          'dynamodb:GetItem',
        ],
        Resource: [
          `arn:aws:dynamodb:*:*:table/${briefingsTableName}`,
        ],
      },
      {
        Effect: 'Allow',
        Action: [
          'bedrock:InvokeModel',
        ],
        Resource: [
          'arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0',
        ],
      },
      {
        Effect: 'Allow',
        Action: ['cloudwatch:PutMetricData'],
        Resource: '*',
      },
    ],
  };

  await iamClient.send(
    new PutRolePolicyCommand({
      RoleName: roleName,
      PolicyName: 'BriefingGeneratorPolicy',
      PolicyDocument: JSON.stringify(inlinePolicy),
    })
  );

  console.log('Attached policies to IAM role.');

  return createRoleResponse.Role!.Arn;
}

/**
 * Packages the Lambda function code
 */
function packageLambda(): Buffer {
  console.log('Building Lambda function...');

  // Build TypeScript code
  execSync('npm run build', {
    cwd: join(__dirname, '..'),
    stdio: 'inherit',
  });

  // Create deployment package
  console.log('Creating deployment package...');
  execSync(
    'zip -r lambda-package.zip dist node_modules',
    {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
    }
  );

  const zipPath = join(__dirname, '..', 'lambda-package.zip');
  return readFileSync(zipPath);
}

/**
 * Creates or updates the Lambda function
 */
async function deployLambdaFunction(
  lambdaClient: LambdaClient,
  functionName: string,
  roleArn: string,
  zipBuffer: Buffer,
  config: {
    signalsTableName: string;
    briefingsTableName: string;
    region: string;
    bedrockModelId: string;
    maxInsights: number;
    narrativeMaxWords: number;
  }
): Promise<void> {
  const environment = {
    Variables: {
      UNIVERSAL_SIGNALS_TABLE: config.signalsTableName,
      BRIEFING_STORE_TABLE: config.briefingsTableName,
      AWS_REGION: config.region,
      BEDROCK_MODEL_ID: config.bedrockModelId,
      MAX_INSIGHTS: config.maxInsights.toString(),
      NARRATIVE_MAX_WORDS: config.narrativeMaxWords.toString(),
    },
  };

  try {
    // Check if function exists
    await lambdaClient.send(
      new GetFunctionCommand({ FunctionName: functionName })
    );

    console.log(`Updating existing Lambda function: ${functionName}`);

    // Update function code
    await lambdaClient.send(
      new UpdateFunctionCodeCommand({
        FunctionName: functionName,
        ZipFile: zipBuffer,
      })
    );

    // Update function configuration
    await lambdaClient.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: functionName,
        Environment: environment,
        MemorySize: 512,
        Timeout: 30,
      })
    );

    console.log('Lambda function updated successfully.');
  } catch (error: any) {
    if (error.name !== 'ResourceNotFoundException') {
      throw error;
    }

    console.log(`Creating new Lambda function: ${functionName}`);

    // Create new function
    await lambdaClient.send(
      new CreateFunctionCommand({
        FunctionName: functionName,
        Runtime: 'nodejs20.x',
        Role: roleArn,
        Handler: 'dist/index.handler',
        Code: { ZipFile: zipBuffer },
        Environment: environment,
        MemorySize: 512,
        Timeout: 30,
        Description: 'Daily briefing generator that transforms business signals into narrative summaries',
      })
    );

    console.log('Lambda function created successfully.');
  }
}

/**
 * Main execution
 */
async function main() {
  const functionName = process.env.LAMBDA_FUNCTION_NAME || 'briefing-generator';
  const roleName = process.env.IAM_ROLE_NAME || 'briefing-generator-role';
  const signalsTableName = process.env.UNIVERSAL_SIGNALS_TABLE || 'UniversalSignals';
  const briefingsTableName = process.env.BRIEFING_STORE_TABLE || 'Briefings';
  const region = process.env.AWS_REGION || 'us-east-1';
  const bedrockModelId = process.env.BEDROCK_MODEL_ID || 'amazon.nova-lite-v1:0';
  const maxInsights = parseInt(process.env.MAX_INSIGHTS || '10', 10);
  const narrativeMaxWords = parseInt(process.env.NARRATIVE_MAX_WORDS || '150', 10);

  console.log(`Deploying Lambda function: ${functionName} in region: ${region}`);

  const iamClient = new IAMClient({ region });
  const lambdaClient = new LambdaClient({ region });

  // Create IAM role
  console.log('Setting up IAM role...');
  const roleArn = await ensureLambdaRole(
    iamClient,
    roleName,
    signalsTableName,
    briefingsTableName
  );

  // Wait for IAM role to propagate
  console.log('Waiting for IAM role to propagate...');
  await new Promise((resolve) => setTimeout(resolve, 10000));

  // Package Lambda code
  const zipBuffer = packageLambda();

  // Deploy Lambda function
  await deployLambdaFunction(lambdaClient, functionName, roleArn, zipBuffer, {
    signalsTableName,
    briefingsTableName,
    region,
    bedrockModelId,
    maxInsights,
    narrativeMaxWords,
  });

  console.log('Lambda deployment complete!');
  console.log(`Function ARN: arn:aws:lambda:${region}:*:function:${functionName}`);
  console.log('\nNext steps:');
  console.log('1. Set up EventBridge scheduler: npm run deploy:eventbridge');
  console.log('2. Test the function: aws lambda invoke --function-name briefing-generator output.json');
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exit(1);
});
