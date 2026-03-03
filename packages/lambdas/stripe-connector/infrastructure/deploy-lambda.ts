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
  tableName: string
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
      Description: 'Execution role for Stripe Connector Lambda',
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

  // Add inline policy for DynamoDB and CloudWatch Metrics
  const inlinePolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: [
          'dynamodb:PutItem',
          'dynamodb:GetItem',
          'dynamodb:Query',
          'dynamodb:UpdateItem',
        ],
        Resource: [
          `arn:aws:dynamodb:*:*:table/${tableName}`,
          `arn:aws:dynamodb:*:*:table/${tableName}/index/*`,
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
      PolicyName: 'StripeConnectorPolicy',
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
    tableName: string;
    region: string;
    webhookSecret: string;
    logLevel: string;
  }
): Promise<void> {
  const environment = {
    Variables: {
      DYNAMODB_TABLE_NAME: config.tableName,
      AWS_REGION: config.region,
      STRIPE_WEBHOOK_SECRET: config.webhookSecret,
      LOG_LEVEL: config.logLevel,
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
        Timeout: 10,
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
        Timeout: 10,
        Description: 'Stripe webhook processor for revenue signal detection',
      })
    );

    console.log('Lambda function created successfully.');
  }
}

/**
 * Main execution
 */
async function main() {
  const functionName = process.env.LAMBDA_FUNCTION_NAME || 'stripe-connector';
  const roleName = process.env.IAM_ROLE_NAME || 'stripe-connector-role';
  const tableName = process.env.DYNAMODB_TABLE_NAME || 'revenue-signals';
  const region = process.env.AWS_REGION || 'us-east-1';
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const logLevel = process.env.LOG_LEVEL || 'info';

  if (!webhookSecret) {
    throw new Error(
      'STRIPE_WEBHOOK_SECRET environment variable is required. Set it before deploying.'
    );
  }

  console.log(`Deploying Lambda function: ${functionName} in region: ${region}`);

  const iamClient = new IAMClient({ region });
  const lambdaClient = new LambdaClient({ region });

  // Create IAM role
  console.log('Setting up IAM role...');
  const roleArn = await ensureLambdaRole(iamClient, roleName, tableName);

  // Wait for IAM role to propagate
  console.log('Waiting for IAM role to propagate...');
  await new Promise((resolve) => setTimeout(resolve, 10000));

  // Package Lambda code
  const zipBuffer = packageLambda();

  // Deploy Lambda function
  await deployLambdaFunction(lambdaClient, functionName, roleArn, zipBuffer, {
    tableName,
    region,
    webhookSecret,
    logLevel,
  });

  console.log('Lambda deployment complete!');
  console.log(`Function ARN: arn:aws:lambda:${region}:*:function:${functionName}`);
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exit(1);
});
