#!/usr/bin/env node
/**
 * Deployment Script for ICP Refinement Engine
 * 
 * Deploys Lambda function, EventBridge schedule, and IAM roles.
 * Run with: npx ts-node infrastructure/deploy.ts
 */

import {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  AddPermissionCommand,
} from '@aws-sdk/client-lambda';
import {
  IAMClient,
  CreateRoleCommand,
  AttachRolePolicyCommand,
  PutRolePolicyCommand,
  GetRoleCommand,
} from '@aws-sdk/client-iam';
import {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
} from '@aws-sdk/client-eventbridge';
import {
  CloudWatchClient,
  PutMetricAlarmCommand,
} from '@aws-sdk/client-cloudwatch';
import {
  SNSClient,
  CreateTopicCommand,
} from '@aws-sdk/client-sns';
import { readFileSync } from 'fs';
import { join } from 'path';

interface DeploymentConfig {
  region: string;
  functionName: string;
  roleName: string;
  scheduleName: string;
  knowledgeBaseId: string;
  analysisTableName: string;
  credentialVaultLambdaArn: string;
  minSampleSize: number;
}

const DEFAULT_CONFIG: DeploymentConfig = {
  region: process.env.AWS_REGION || 'us-east-1',
  functionName: 'icp-refinement-engine',
  roleName: 'icp-refinement-lambda-role',
  scheduleName: 'icp-refinement-schedule',
  knowledgeBaseId: process.env.KNOWLEDGE_BASE_ID || '',
  analysisTableName: process.env.ANALYSIS_TABLE_NAME || 'icp-analysis-history',
  credentialVaultLambdaArn: process.env.CREDENTIAL_VAULT_LAMBDA_ARN || '',
  minSampleSize: 20,
};

/**
 * Creates IAM role for Lambda execution
 */
async function createLambdaRole(config: DeploymentConfig): Promise<string> {
  const iamClient = new IAMClient({ region: config.region });

  // Check if role exists
  try {
    const existingRole = await iamClient.send(
      new GetRoleCommand({ RoleName: config.roleName })
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

  // Create role
  const assumeRolePolicy = {
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
      RoleName: config.roleName,
      AssumeRolePolicyDocument: JSON.stringify(assumeRolePolicy),
      Description: 'Execution role for ICP refinement Lambda',
    })
  );

  const newRoleArn = createRoleResponse.Role?.Arn;
  if (!newRoleArn) {
    throw new Error('Failed to create role: ARN is missing');
  }
  console.log('IAM role created:', newRoleArn);

  // Attach managed policies
  await iamClient.send(
    new AttachRolePolicyCommand({
      RoleName: config.roleName,
      PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    })
  );

  // Create inline policy for service permissions
  const inlinePolicy = {
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Action: [
          'bedrock:InvokeModel',
          'bedrock:Retrieve',
          'bedrock:UpdateKnowledgeBase',
        ],
        Resource: '*',
      },
      {
        Effect: 'Allow',
        Action: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:Query'],
        Resource: `arn:aws:dynamodb:${config.region}:*:table/${config.analysisTableName}`,
      },
      {
        Effect: 'Allow',
        Action: ['lambda:InvokeFunction'],
        Resource: config.credentialVaultLambdaArn,
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
      RoleName: config.roleName,
      PolicyName: 'icp-refinement-permissions',
      PolicyDocument: JSON.stringify(inlinePolicy),
    })
  );

  console.log('IAM policies attached');

  return newRoleArn;
}

/**
 * Deploys or updates Lambda function
 */
async function deployLambdaFunction(
  config: DeploymentConfig,
  roleArn: string
): Promise<string> {
  const lambdaClient = new LambdaClient({ region: config.region });

  // Read deployment package
  const zipPath = join(__dirname, '../dist/lambda.zip');
  let zipBuffer: Buffer;
  
  try {
    zipBuffer = readFileSync(zipPath);
  } catch (error) {
    throw new Error(
      `Deployment package not found at ${zipPath}. Run 'npm run build' first.`
    );
  }

  // Check if function exists
  let functionArn: string;
  try {
    const existingFunction = await lambdaClient.send(
      new GetFunctionCommand({ FunctionName: config.functionName })
    );
    
    // Update existing function
    await lambdaClient.send(
      new UpdateFunctionCodeCommand({
        FunctionName: config.functionName,
        ZipFile: zipBuffer,
      })
    );

    await lambdaClient.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: config.functionName,
        Runtime: 'nodejs18.x',
        Handler: 'index.handler',
        Timeout: 900, // 15 minutes
        MemorySize: 1024,
        Environment: {
          Variables: {
            AWS_REGION: config.region,
            KNOWLEDGE_BASE_ID: config.knowledgeBaseId,
            ANALYSIS_TABLE_NAME: config.analysisTableName,
            CREDENTIAL_VAULT_LAMBDA_ARN: config.credentialVaultLambdaArn,
            MIN_SAMPLE_SIZE: config.minSampleSize.toString(),
            NOVA_MODEL_ID: 'amazon.nova-lite-v1:0',
          },
        },
      })
    );

    functionArn = existingFunction.Configuration!.FunctionArn!;
    console.log('Lambda function updated:', functionArn);
  } catch (error) {
    // Function doesn't exist, create it
    const createResponse = await lambdaClient.send(
      new CreateFunctionCommand({
        FunctionName: config.functionName,
        Runtime: 'nodejs18.x',
        Role: roleArn,
        Handler: 'index.handler',
        Code: { ZipFile: zipBuffer },
        Timeout: 900,
        MemorySize: 1024,
        Description: 'Autonomous ICP refinement engine',
        Environment: {
          Variables: {
            AWS_REGION: config.region,
            KNOWLEDGE_BASE_ID: config.knowledgeBaseId,
            ANALYSIS_TABLE_NAME: config.analysisTableName,
            CREDENTIAL_VAULT_LAMBDA_ARN: config.credentialVaultLambdaArn,
            MIN_SAMPLE_SIZE: config.minSampleSize.toString(),
            NOVA_MODEL_ID: 'amazon.nova-lite-v1:0',
          },
        },
      })
    );

    functionArn = createResponse.FunctionArn!;
    console.log('Lambda function created:', functionArn);
  }

  return functionArn;
}

/**
 * Creates EventBridge schedule
 */
async function createSchedule(
  config: DeploymentConfig,
  functionArn: string
): Promise<void> {
  const eventBridgeClient = new EventBridgeClient({ region: config.region });
  const lambdaClient = new LambdaClient({ region: config.region });

  // Create EventBridge rule
  const ruleResponse = await eventBridgeClient.send(
    new PutRuleCommand({
      Name: config.scheduleName,
      ScheduleExpression: 'rate(7 days)',
      State: 'ENABLED',
      Description: 'Triggers ICP refinement analysis every 7 days',
    })
  );

  console.log('EventBridge rule created:', ruleResponse.RuleArn);

  // Add Lambda permission for EventBridge
  try {
    await lambdaClient.send(
      new AddPermissionCommand({
        FunctionName: config.functionName,
        StatementId: 'AllowEventBridgeInvoke',
        Action: 'lambda:InvokeFunction',
        Principal: 'events.amazonaws.com',
        SourceArn: ruleResponse.RuleArn,
      })
    );
    console.log('Lambda permission added for EventBridge');
  } catch (error) {
    // Permission might already exist
    console.log('Lambda permission already exists');
  }

  // Add Lambda as target
  await eventBridgeClient.send(
    new PutTargetsCommand({
      Rule: config.scheduleName,
      Targets: [
        {
          Id: '1',
          Arn: functionArn,
        },
      ],
    })
  );

  console.log('EventBridge target configured');
}

/**
 * Creates SNS topic for alarm notifications
 */
async function createAlarmTopic(config: DeploymentConfig): Promise<string> {
  const snsClient = new SNSClient({ region: config.region });

  try {
    const topicResponse = await snsClient.send(
      new CreateTopicCommand({
        Name: `${config.functionName}-alarms`,
      })
    );

    const topicArn = topicResponse.TopicArn;
    if (!topicArn) {
      throw new Error('Failed to create SNS topic: ARN is missing');
    }
    console.log('SNS topic created:', topicArn);
    return topicArn;
  } catch (error) {
    console.error('Failed to create SNS topic:', error);
    throw error;
  }
}

/**
 * Creates CloudWatch alarms for monitoring
 */
async function createCloudWatchAlarms(
  config: DeploymentConfig,
  snsTopicArn: string
): Promise<void> {
  const cwClient = new CloudWatchClient({ region: config.region });

  // Alarm 1: Analysis Failures
  await cwClient.send(
    new PutMetricAlarmCommand({
      AlarmName: `${config.functionName}-analysis-failure`,
      AlarmDescription: 'Triggers when ICP analysis fails 2 consecutive times',
      MetricName: 'ICPAnalysisSuccess',
      Namespace: 'Sesari/ICPRefinement',
      Statistic: 'Sum',
      Period: 86400,
      EvaluationPeriods: 2,
      Threshold: 0,
      ComparisonOperator: 'LessThanOrEqualToThreshold',
      TreatMissingData: 'breaching',
      ActionsEnabled: true,
      AlarmActions: [snsTopicArn],
    })
  );
  console.log('Analysis failure alarm created');

  // Alarm 2: Insufficient Sample Size
  await cwClient.send(
    new PutMetricAlarmCommand({
      AlarmName: `${config.functionName}-insufficient-sample`,
      AlarmDescription: 'Triggers when customer sample size is below minimum',
      MetricName: 'CustomersAnalyzed',
      Namespace: 'Sesari/ICPRefinement',
      Statistic: 'Average',
      Period: 86400,
      EvaluationPeriods: 1,
      Threshold: config.minSampleSize,
      ComparisonOperator: 'LessThanThreshold',
      TreatMissingData: 'breaching',
      ActionsEnabled: true,
      AlarmActions: [snsTopicArn],
    })
  );
  console.log('Insufficient sample alarm created');
}

/**
 * Main deployment function
 */
async function deploy(): Promise<void> {
  console.log('Starting ICP Refinement Engine deployment...\n');

  const config = DEFAULT_CONFIG;

  // Validate configuration
  if (!config.knowledgeBaseId) {
    throw new Error('KNOWLEDGE_BASE_ID environment variable is required');
  }
  if (!config.credentialVaultLambdaArn) {
    throw new Error('CREDENTIAL_VAULT_LAMBDA_ARN environment variable is required');
  }

  try {
    // Step 1: Create IAM role
    console.log('Step 1: Creating IAM role...');
    const roleArn = await createLambdaRole(config);
    
    // Wait for IAM role to propagate
    console.log('Waiting for IAM role to propagate...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    // Step 2: Deploy Lambda function
    console.log('\nStep 2: Deploying Lambda function...');
    const functionArn = await deployLambdaFunction(config, roleArn);

    // Step 3: Create EventBridge schedule
    console.log('\nStep 3: Creating EventBridge schedule...');
    await createSchedule(config, functionArn);

    // Step 4: Create CloudWatch alarms
    console.log('\nStep 4: Creating CloudWatch alarms...');
    const snsTopicArn = await createAlarmTopic(config);
    await createCloudWatchAlarms(config, snsTopicArn);

    console.log('\n✅ Deployment completed successfully!');
    console.log('\nNext steps:');
    console.log('1. Test manual invocation: See infrastructure/MANUAL_TRIGGER.md');
    console.log('2. Monitor CloudWatch logs: /aws/lambda/' + config.functionName);
    console.log('3. Check EventBridge schedule: ' + config.scheduleName);
    console.log('4. Subscribe to SNS topic for alarm notifications: ' + snsTopicArn);
  } catch (error) {
    console.error('\n❌ Deployment failed:', error);
    process.exit(1);
  }
}

// Run deployment if executed directly
if (require.main === module) {
  deploy();
}

export type { DeploymentConfig };
export { deploy, DEFAULT_CONFIG };
