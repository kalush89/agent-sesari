/**
 * CloudWatch Alarms Configuration for ICP Refinement Engine
 * 
 * Creates alarms for monitoring critical conditions:
 * - Analysis failures
 * - Low confidence scores
 * - Insufficient sample size
 */

import {
  CloudWatchClient,
  PutMetricAlarmCommand,
  DescribeAlarmsCommand,
} from '@aws-sdk/client-cloudwatch';
import { SNSClient, CreateTopicCommand, SubscribeCommand } from '@aws-sdk/client-sns';

interface AlarmConfig {
  region: string;
  functionName: string;
  snsTopicArn?: string;
  emailEndpoint?: string;
}

/**
 * Creates SNS topic for alarm notifications
 */
export async function createAlarmTopic(
  config: AlarmConfig
): Promise<string> {
  const snsClient = new SNSClient({ region: config.region });

  try {
    const topicResponse = await snsClient.send(
      new CreateTopicCommand({
        Name: 'icp-refinement-alarms',
        DisplayName: 'ICP Refinement Engine Alarms',
      })
    );

    const topicArn = topicResponse.TopicArn!;
    console.log('SNS topic created:', topicArn);

    // Subscribe email if provided
    if (config.emailEndpoint) {
      await snsClient.send(
        new SubscribeCommand({
          TopicArn: topicArn,
          Protocol: 'email',
          Endpoint: config.emailEndpoint,
        })
      );
      console.log('Email subscription created (check inbox for confirmation)');
    }

    return topicArn;
  } catch (error) {
    console.error('Failed to create SNS topic:', error);
    throw new Error(`SNS topic creation failed: ${(error as Error).message}`);
  }
}

/**
 * Creates alarm for consecutive analysis failures
 */
export async function createAnalysisFailureAlarm(
  config: AlarmConfig,
  snsTopicArn: string
): Promise<void> {
  const cwClient = new CloudWatchClient({ region: config.region });

  try {
    await cwClient.send(
      new PutMetricAlarmCommand({
        AlarmName: 'icp-refinement-analysis-failures',
        AlarmDescription: 'Triggers when ICP analysis fails 2 consecutive times',
        MetricName: 'ICPAnalysisSuccess',
        Namespace: 'ICPRefinement',
        Statistic: 'Sum',
        Period: 86400, // 1 day
        EvaluationPeriods: 2,
        Threshold: 0,
        ComparisonOperator: 'LessThanOrEqualToThreshold',
        TreatMissingData: 'breaching',
        ActionsEnabled: true,
        AlarmActions: [snsTopicArn],
      })
    );

    console.log('Analysis failure alarm created');
  } catch (error) {
    console.error('Failed to create analysis failure alarm:', error);
    throw new Error(`Alarm creation failed: ${(error as Error).message}`);
  }
}

/**
 * Creates alarm for low confidence scores
 */
export async function createLowConfidenceAlarm(
  config: AlarmConfig,
  snsTopicArn: string
): Promise<void> {
  const cwClient = new CloudWatchClient({ region: config.region });

  try {
    await cwClient.send(
      new PutMetricAlarmCommand({
        AlarmName: 'icp-refinement-low-confidence',
        AlarmDescription: 'Triggers when ICP confidence score is below 50',
        MetricName: 'ICPConfidenceScore',
        Namespace: 'ICPRefinement',
        Statistic: 'Average',
        Period: 86400, // 1 day
        EvaluationPeriods: 1,
        Threshold: 50,
        ComparisonOperator: 'LessThanThreshold',
        TreatMissingData: 'notBreaching',
        ActionsEnabled: true,
        AlarmActions: [snsTopicArn],
      })
    );

    console.log('Low confidence alarm created');
  } catch (error) {
    console.error('Failed to create low confidence alarm:', error);
    throw new Error(`Alarm creation failed: ${(error as Error).message}`);
  }
}

/**
 * Creates alarm for insufficient sample size
 */
export async function createInsufficientSampleAlarm(
  config: AlarmConfig,
  snsTopicArn: string
): Promise<void> {
  const cwClient = new CloudWatchClient({ region: config.region });

  try {
    await cwClient.send(
      new PutMetricAlarmCommand({
        AlarmName: 'icp-refinement-insufficient-sample',
        AlarmDescription: 'Triggers when customer sample size is below minimum',
        MetricName: 'CustomersAnalyzed',
        Namespace: 'ICPRefinement',
        Statistic: 'Average',
        Period: 86400, // 1 day
        EvaluationPeriods: 1,
        Threshold: 20, // MIN_SAMPLE_SIZE default
        ComparisonOperator: 'LessThanThreshold',
        TreatMissingData: 'breaching',
        ActionsEnabled: true,
        AlarmActions: [snsTopicArn],
      })
    );

    console.log('Insufficient sample size alarm created');
  } catch (error) {
    console.error('Failed to create insufficient sample alarm:', error);
    throw new Error(`Alarm creation failed: ${(error as Error).message}`);
  }
}

/**
 * Creates all CloudWatch alarms for ICP refinement monitoring
 */
export async function setupAllAlarms(config: AlarmConfig): Promise<void> {
  console.log('Setting up CloudWatch alarms...\n');

  try {
    // Create or use existing SNS topic
    const snsTopicArn = config.snsTopicArn || await createAlarmTopic(config);

    // Create all alarms
    console.log('\nCreating alarms...');
    await createAnalysisFailureAlarm(config, snsTopicArn);
    await createLowConfidenceAlarm(config, snsTopicArn);
    await createInsufficientSampleAlarm(config, snsTopicArn);

    console.log('\n✅ All CloudWatch alarms created successfully!');
    console.log('\nAlarms configured:');
    console.log('1. icp-refinement-analysis-failures');
    console.log('2. icp-refinement-low-confidence');
    console.log('3. icp-refinement-insufficient-sample');
    
    if (config.emailEndpoint) {
      console.log('\n⚠️  Check your email to confirm SNS subscription');
    }
  } catch (error) {
    console.error('\n❌ Alarm setup failed:', error);
    throw error;
  }
}

/**
 * Lists existing alarms for ICP refinement
 */
export async function listAlarms(region: string): Promise<void> {
  const cwClient = new CloudWatchClient({ region });

  try {
    const response = await cwClient.send(
      new DescribeAlarmsCommand({
        AlarmNamePrefix: 'icp-refinement-',
      })
    );

    if (!response.MetricAlarms || response.MetricAlarms.length === 0) {
      console.log('No ICP refinement alarms found');
      return;
    }

    console.log('\nExisting ICP Refinement Alarms:');
    response.MetricAlarms.forEach((alarm) => {
      console.log(`- ${alarm.AlarmName}: ${alarm.StateValue}`);
    });
  } catch (error) {
    console.error('Failed to list alarms:', error);
    throw error;
  }
}
