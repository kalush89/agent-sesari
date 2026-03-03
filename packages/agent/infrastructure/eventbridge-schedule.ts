/**
 * EventBridge Schedule Configuration for ICP Refinement Engine
 * 
 * Creates a scheduled rule that triggers the ICP refinement Lambda every 7 days.
 * This file can be used with AWS CDK or as reference for manual setup.
 */

import { EventBridgeClient, PutRuleCommand, PutTargetsCommand } from '@aws-sdk/client-eventbridge';

interface ScheduleConfig {
  scheduleName: string;
  scheduleExpression: string;
  lambdaFunctionArn: string;
  enabled: boolean;
  region: string;
}

/**
 * Creates an EventBridge schedule for the ICP refinement Lambda
 */
export async function createEventBridgeSchedule(config: ScheduleConfig): Promise<void> {
  const client = new EventBridgeClient({ region: config.region });

  try {
    // Create the EventBridge rule
    const putRuleResponse = await client.send(new PutRuleCommand({
      Name: config.scheduleName,
      ScheduleExpression: config.scheduleExpression,
      State: config.enabled ? 'ENABLED' : 'DISABLED',
      Description: 'Triggers ICP refinement analysis every 7 days',
    }));

    console.log('EventBridge rule created:', putRuleResponse.RuleArn);

    // Add Lambda as target
    await client.send(new PutTargetsCommand({
      Rule: config.scheduleName,
      Targets: [
        {
          Id: '1',
          Arn: config.lambdaFunctionArn,
          Input: JSON.stringify({
            source: 'eventbridge',
            triggerType: 'scheduled',
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
 * Default configuration for ICP refinement schedule
 */
export const DEFAULT_SCHEDULE_CONFIG: Omit<ScheduleConfig, 'lambdaFunctionArn' | 'region'> = {
  scheduleName: 'icp-refinement-schedule',
  scheduleExpression: 'rate(7 days)',
  enabled: true,
};
