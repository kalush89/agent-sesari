import {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  PutFunctionConcurrencyCommand,
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
 * Creates or retrieves the IAM role for the baseline calculator Lambda function
 */
async function ensureLambdaRole(
  iamClient: IAMClient,
  roleName: string,
  signalsTableName: string,
  baselinesTableName: string
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
      Description: 'Execution role for Mixpanel Baseline Calculator Lambda',
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
          'dynamodb:Scan',
        ],
        Resource: [
          `arn:aws:dynamodb:*:*:table/${signalsTableName}`,
          `arn:aws:dynamodb:*:*:table/${signalsTableName}/index/*`,
          `arn:aws:dynamodb:*:*:table/${baselinesTableName}`,
          `arn:aws:dynamodb:*:*:table/${baselinesTableName}/index/*`,
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
      PolicyName: 'MixpanelBaselineCalculatorPolicy',
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
    'zip -r baseline-calculator-package.zip dist node_modules',
    {
      cwd: join(__dirname, '..'),
      stdio: 'inherit',
    }
  );

  const zipPath = join(__dirname, '..', 'baseline-calculator-package.zip');
  return readFileSync(zipPath);
}

/**
 * Creates or updates the baseline calculator Lambda function
 */
async function deployLambdaFunction(
  lambdaClient: LambdaClient,
  functionName: string,
  roleArn: string,
  zipBuffer: Buffer,
  config: {
    signalsTableName: string;
    baselinesTableName: string;
    region: string;
    adoptionDropThreshold: string;
    inactivityThresholdDays: string;
    powerUserDaysThreshold: string;
    powerUserPercentile: string;
    logLevel: string;
  }
): Promise<void> {
  const environment = {
    Variables: {
      DYNAMODB_SIGNALS_TABLE: config.signalsTableName,
      DYNAMODB_BASELINES_TABLE: config.baselinesTableName,
      AWS_REGION: config.region,
      ADOPTION_DROP_THRESHOLD: config.adoptionDropThreshold,
      INACTIVITY_THRESHOLD_DAYS: config.inactivityThresholdDays,
      POWER_USER_DAYS_THRESHOLD: config.powerUserDaysThreshold,
      POWER_USER_PERCENTILE: config.powerUserPercentile,
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
        MemorySize: 1024,
        Timeout: 300,
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
        Handler: 'dist/baseline-calculator.handler',
        Code: { ZipFile: zipBuffer },
        Environment: environment,
        MemorySize: 1024,
        Timeout: 300,
        Description: 'Mixpanel usage baseline calculator for behavioral signal detection',
      })
    );

    console.log('Lambda function created successfully.');
  }

  // Set concurrency to 1 to prevent overlapping runs
  await lambdaClient.send(
    new PutFunctionConcurrencyCommand({
      FunctionName: functionName,
      ReservedConcurrentExecutions: 1,
    })
  );

  console.log('Set concurrency to 1 to prevent overlapping runs.');
}

/**
 * Main execution
 */
async function main() {
  const functionName = process.env.LAMBDA_FUNCTION_NAME || 'mixpanel-baseline-calculator';
  const roleName = process.env.IAM_ROLE_NAME || 'mixpanel-baseline-calculator-role';
  const signalsTableName = process.env.DYNAMODB_SIGNALS_TABLE || 'behavioral-signals';
  const baselinesTableName = process.env.DYNAMODB_BASELINES_TABLE || 'usage-baselines';
  const region = process.env.AWS_REGION || 'us-east-1';
  const adoptionDropThreshold = process.env.ADOPTION_DROP_THRESHOLD || '50';
  const inactivityThresholdDays = process.env.INACTIVITY_THRESHOLD_DAYS || '14';
  const powerUserDaysThreshold = process.env.POWER_USER_DAYS_THRESHOLD || '20';
  const powerUserPercentile = process.env.POWER_USER_PERCENTILE || '90';
  const logLevel = process.env.LOG_LEVEL || 'info';

  console.log(`Deploying Lambda function: ${functionName} in region: ${region}`);

  const iamClient = new IAMClient({ region });
  const lambdaClient = new LambdaClient({ region });

  // Create IAM role
  console.log('Setting up IAM role...');
  const roleArn = await ensureLambdaRole(iamClient, roleName, signalsTableName, baselinesTableName);

  // Wait for IAM role to propagate
  console.log('Waiting for IAM role to propagate...');
  await new Promise((resolve) => setTimeout(resolve, 10000));

  // Package Lambda code
  const zipBuffer = packageLambda();

  // Deploy Lambda function
  await deployLambdaFunction(lambdaClient, functionName, roleArn, zipBuffer, {
    signalsTableName,
    baselinesTableName,
    region,
    adoptionDropThreshold,
    inactivityThresholdDays,
    powerUserDaysThreshold,
    powerUserPercentile,
    logLevel,
  });

  console.log('\nLambda deployment complete!');
  console.log(`Function ARN: arn:aws:lambda:${region}:*:function:${functionName}`);
}

main().catch((error) => {
  console.error('Deployment failed:', error);
  process.exit(1);
});
