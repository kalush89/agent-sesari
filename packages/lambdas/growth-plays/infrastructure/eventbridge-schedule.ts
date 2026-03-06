/**
 * EventBridge Scheduler Setup
 * 
 * Creates an EventBridge rule to trigger Signal Orchestrator Lambda daily at 6 AM UTC.
 */

import {
  EventBridgeClient,
  PutRuleCommand,
  PutTargetsCommand,
} from '@aws-sdk/client-eventbridge';
import { LambdaClient, AddPermissionCommand } from '@aws-sdk/client-lambda';

const eventBridgeClient = new EventBridgeClient({ region: process.env.AWS_REGION || 'us-east-1' });
const lambdaClient = new LambdaClient({ region: process.env.AWS_REGION || 'us-east-1' });

/**
 * Creates EventBridge rule for daily Signal Orchestrator trigger
 */
async function setupEventBridgeSchedule() {
  const ruleName = 'growth-plays-daily-trigger';
  const lambdaFunctionName = process.env.SIGNAL_ORCHESTRATOR_LAMBDA || 'signal-orchestrator';
  const lambdaArn = `arn:aws:lambda:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:function:${lambdaFunctionName}`;

  try {
    // Create EventBridge rule with cron expression for 6 AM UTC daily
    console.log('Creating EventBridge rule...');
    await eventBridgeClient.send(
      new PutRuleCommand({
        Name: ruleName,
        Description: 'Triggers Signal Orchestrator Lambda daily at 6 AM UTC',
        ScheduleExpression: 'cron(0 6 * * ? *)', // 6 AM UTC every day
        State: 'ENABLED',
      })
    );
    console.log(`✓ EventBridge rule '${ruleName}' created`);

    // Add Lambda as target
    console.log('Adding Lambda target to rule...');
    await eventBridgeClient.send(
      new PutTargetsCommand({
        Rule: ruleName,
        Targets: [
          {
            Id: '1',
            Arn: lambdaArn,
            Input: JSON.stringify({
              forceRefresh: false,
              timeRangeHours: 720, // 30 days
            }),
          },
        ],
      })
    );
    console.log(`✓ Lambda target added to rule`);

    // Grant EventBridge permission to invoke Lambda
    console.log('Granting EventBridge permission to invoke Lambda...');
    try {
      await lambdaClient.send(
        new AddPermissionCommand({
          FunctionName: lambdaFunctionName,
          StatementId: `${ruleName}-permission`,
          Action: 'lambda:InvokeFunction',
          Principal: 'events.amazonaws.com',
          SourceArn: `arn:aws:events:${process.env.AWS_REGION}:${process.env.AWS_ACCOUNT_ID}:rule/${ruleName}`,
        })
      );
      console.log(`✓ Permission granted`);
    } catch (error: any) {
      if (error.name === 'ResourceConflictException') {
        console.log('✓ Permission already exists');
      } else {
        throw error;
      }
    }

    console.log('\n✅ EventBridge schedule setup complete!');
    console.log(`Rule: ${ruleName}`);
    console.log(`Schedule: Daily at 6 AM UTC`);
    console.log(`Target: ${lambdaArn}`);
  } catch (error) {
    console.error('❌ Failed to setup EventBridge schedule:', error);
    throw error;
  }
}

// Run setup if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupEventBridgeSchedule()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { setupEventBridgeSchedule };
