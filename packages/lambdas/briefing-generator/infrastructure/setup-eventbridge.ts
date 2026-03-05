import {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
  DescribeRuleCommand,
  ListTargetsByRuleCommand,
} from '@aws-sdk/client-eventbridge';
import {
  LambdaClient,
  AddPermissionCommand,
  GetPolicyCommand,
} from '@aws-sdk/client-lambda';

/**
 * Creates or updates the EventBridge rule for daily briefing generation
 */
async function ensureEventBridgeRule(
  client: EventBridgeClient,
  ruleName: string,
  scheduleExpression: string
): Promise<void> {
  try {
    // Check if rule already exists
    await client.send(new DescribeRuleCommand({ Name: ruleName }));
    console.log(`EventBridge rule ${ruleName} already exists. Updating...`);
  } catch (error: any) {
    if (error.name !== 'ResourceNotFoundException') {
      throw error;
    }
    console.log(`Creating new EventBridge rule: ${ruleName}`);
  }

  await client.send(
    new PutRuleCommand({
      Name: ruleName,
      Description: 'Daily trigger for briefing generation at 8:00 AM UTC',
      ScheduleExpression: scheduleExpression,
      State: 'ENABLED',
    })
  );

  console.log(`EventBridge rule ${ruleName} configured with schedule: ${scheduleExpression}`);
}

/**
 * Adds the Lambda function as a target for the EventBridge rule with retry policy
 */
async function addLambdaTarget(
  client: EventBridgeClient,
  ruleName: string,
  lambdaArn: string
): Promise<void> {
  // Check if target already exists
  const targetsResponse = await client.send(
    new ListTargetsByRuleCommand({ Rule: ruleName })
  );

  const existingTarget = targetsResponse.Targets?.find(
    (target: any) => target.Arn === lambdaArn
  );

  if (existingTarget) {
    console.log('Lambda target already configured.');
    return;
  }

  await client.send(
    new PutTargetsCommand({
      Rule: ruleName,
      Targets: [
        {
          Id: '1',
          Arn: lambdaArn,
          RetryPolicy: {
            MaximumRetryAttempts: 2,
            MaximumEventAge: 3600, // 1 hour in seconds
          },
        },
      ],
    })
  );

  console.log(`Added Lambda function as target: ${lambdaArn}`);
  console.log('Retry policy configured: 2 attempts, 1 hour max age');
}

/**
 * Grants EventBridge permission to invoke the Lambda function
 */
async function grantEventBridgePermission(
  lambdaClient: LambdaClient,
  functionName: string,
  ruleName: string,
  region: string,
  accountId: string
): Promise<void> {
  const sourceArn = `arn:aws:events:${region}:${accountId}:rule/${ruleName}`;

  try {
    // Check if permission already exists
    const policyResponse = await lambdaClient.send(
      new GetPolicyCommand({ FunctionName: functionName })
    );

    if (policyResponse.Policy?.includes(sourceArn)) {
      console.log('EventBridge permission already exists.');
      return;
    }
  } catch (error: any) {
    if (error.name !== 'ResourceNotFoundException') {
      throw error;
    }
  }

  await lambdaClient.send(
    new AddPermissionCommand({
      FunctionName: functionName,
      StatementId: `eventbridge-invoke-${Date.now()}`,
      Action: 'lambda:InvokeFunction',
      Principal: 'events.amazonaws.com',
      SourceArn: sourceArn,
    })
  );

  console.log('Granted EventBridge permission to invoke Lambda.');
}

/**
 * Main execution
 */
async function main() {
  const ruleName = process.env.EVENTBRIDGE_RULE_NAME || 'briefing-generator-daily';
  const functionName = process.env.LAMBDA_FUNCTION_NAME || 'briefing-generator';
  const scheduleExpression = process.env.SCHEDULE_EXPRESSION || 'cron(0 8 * * ? *)';
  const region = process.env.AWS_REGION || 'us-east-1';
  const accountId = process.env.AWS_ACCOUNT_ID;

  if (!accountId) {
    throw new Error(
      'AWS_ACCOUNT_ID environment variable is required. Set it to your AWS account ID.'
    );
  }

  console.log(`Setting up EventBridge rule: ${ruleName} in region: ${region}`);
  console.log(`Schedule: ${scheduleExpression} (8 AM UTC daily)`);

  const eventBridgeClient = new EventBridgeClient({ region });
  const lambdaClient = new LambdaClient({ region });

  // Create or update EventBridge rule
  await ensureEventBridgeRule(eventBridgeClient, ruleName, scheduleExpression);

  // Add Lambda as target with retry policy
  const lambdaArn = `arn:aws:lambda:${region}:${accountId}:function:${functionName}`;
  await addLambdaTarget(eventBridgeClient, ruleName, lambdaArn);

  // Grant EventBridge permission to invoke Lambda
  await grantEventBridgePermission(
    lambdaClient,
    functionName,
    ruleName,
    region,
    accountId
  );

  console.log('\nEventBridge setup complete!');
  console.log(`\nThe briefing generator will run daily at 8 AM UTC.`);
  console.log('\nTo change the schedule, update the SCHEDULE_EXPRESSION environment variable.');
  console.log('Example schedules:');
  console.log('  - cron(0 8 * * ? *) = 8 AM UTC daily');
  console.log('  - cron(0 */6 * * ? *) = Every 6 hours');
  console.log('  - cron(0 0 * * MON *) = Midnight UTC every Monday');
}

main().catch((error) => {
  console.error('Setup failed:', error);
  process.exit(1);
});
