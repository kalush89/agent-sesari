/**
 * EventBridge Schedule Configuration for Weekly Performance Summaries
 * 
 * Creates a scheduled rule that triggers the performance summarizer Lambda every Sunday at midnight UTC.
 * This ensures weekly business metrics are aggregated and stored in the memory system.
 */

import { 
  EventBridgeClient, 
  PutRuleCommand, 
  PutTargetsCommand,
  RemoveTargetsCommand,
  DeleteRuleCommand
} from '@aws-sdk/client-eventbridge';
import { 
  LambdaClient, 
  AddPermissionCommand, 
  RemovePermissionCommand 
} from '@aws-sdk/client-lambda';

interface SummaryScheduleConfig {
  scheduleName: string;
  scheduleExpression: string;
  lambdaFunctionArn: string;
  lambdaFunctionName: string;
  enabled: boolean;
  region: string;
}

/**
 * Creates an EventBridge schedule for weekly performance summaries
 * 
 * @param config - Schedule configuration
 */
export async function createSummarySchedule(config: SummaryScheduleConfig): Promise<void> {
  const eventBridgeClient = new EventBridgeClient({ region: config.region });
  const lambdaClient = new LambdaClient({ region: config.region });

  try {
    // Step 1: Create the EventBridge rule
    const putRuleResponse = await eventBridgeClient.send(new PutRuleCommand({
      Name: config.scheduleName,
      ScheduleExpression: config.scheduleExpression,
      State: config.enabled ? 'ENABLED' : 'DISABLED',
      Description: 'Triggers weekly performance summary generation every Sunday at midnight UTC',
    }));

    console.log('EventBridge rule created:', putRuleResponse.RuleArn);

    // Step 2: Grant EventBridge permission to invoke Lambda
    const statementId = `${config.scheduleName}-permission`;
    
    try {
      await lambdaClient.send(new AddPermissionCommand({
        FunctionName: config.lambdaFunctionName,
        StatementId: statementId,
        Action: 'lambda:InvokeFunction',
        Principal: 'events.amazonaws.com',
        SourceArn: putRuleResponse.RuleArn,
      }));
      
      console.log('Lambda invocation permission granted to EventBridge');
    } catch (error) {
      // Permission might already exist, log and continue
      if (error.name === 'ResourceConflictException') {
        console.log('Lambda permission already exists, continuing...');
      } else {
        throw error;
      }
    }

    // Step 3: Add Lambda as target
    await eventBridgeClient.send(new PutTargetsCommand({
      Rule: config.scheduleName,
      Targets: [
        {
          Id: '1',
          Arn: config.lambdaFunctionArn,
          Input: JSON.stringify({
            source: 'eventbridge',
            triggerType: 'weekly-summary',
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    }));

    console.log('Lambda target configured successfully');
  } catch (error) {
    console.error('Failed to create EventBridge schedule:', error);
    throw new Error(`EventBridge setup failed: ${error.message}`);
  }
}

/**
 * Removes the EventBridge schedule and associated permissions
 * 
 * @param config - Schedule configuration
 */
export async function removeSummarySchedule(config: SummaryScheduleConfig): Promise<void> {
  const eventBridgeClient = new EventBridgeClient({ region: config.region });
  const lambdaClient = new LambdaClient({ region: config.region });

  try {
    // Remove targets first
    await eventBridgeClient.send(new RemoveTargetsCommand({
      Rule: config.scheduleName,
      Ids: ['1'],
    }));

    console.log('Lambda target removed');

    // Remove Lambda permission
    const statementId = `${config.scheduleName}-permission`;
    
    try {
      await lambdaClient.send(new RemovePermissionCommand({
        FunctionName: config.lambdaFunctionName,
        StatementId: statementId,
      }));
      
      console.log('Lambda invocation permission removed');
    } catch (error) {
      // Permission might not exist, log and continue
      if (error.name === 'ResourceNotFoundException') {
        console.log('Lambda permission not found, continuing...');
      } else {
        throw error;
      }
    }

    // Delete the rule
    await eventBridgeClient.send(new DeleteRuleCommand({
      Name: config.scheduleName,
    }));

    console.log('EventBridge rule deleted');
  } catch (error) {
    console.error('Failed to remove EventBridge schedule:', error);
    throw new Error(`EventBridge cleanup failed: ${error.message}`);
  }
}

/**
 * Default configuration for weekly summary schedule
 */
export const DEFAULT_SUMMARY_SCHEDULE_CONFIG: Omit<
  SummaryScheduleConfig, 
  'lambdaFunctionArn' | 'lambdaFunctionName' | 'region'
> = {
  scheduleName: 'weekly-performance-summary',
  scheduleExpression: 'cron(0 0 ? * SUN *)', // Every Sunday at midnight UTC
  enabled: true,
};
