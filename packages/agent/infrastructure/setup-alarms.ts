#!/usr/bin/env node
/**
 * CLI Script for Setting Up CloudWatch Alarms
 * 
 * Usage:
 *   npx ts-node infrastructure/setup-alarms.ts
 * 
 * Environment Variables:
 *   AWS_REGION - AWS region (default: us-east-1)
 *   SNS_EMAIL - Email address for alarm notifications (optional)
 *   SNS_TOPIC_ARN - Existing SNS topic ARN (optional)
 */

import { setupAllAlarms, listAlarms } from './cloudwatch-alarms';

interface CLIConfig {
  region: string;
  functionName: string;
  snsTopicArn?: string;
  emailEndpoint?: string;
}

async function main() {
  const config: CLIConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    functionName: 'icp-refinement-engine',
    snsTopicArn: process.env.SNS_TOPIC_ARN,
    emailEndpoint: process.env.SNS_EMAIL,
  };

  console.log('ICP Refinement Engine - CloudWatch Alarms Setup');
  console.log('='.repeat(50));
  console.log(`Region: ${config.region}`);
  console.log(`Function: ${config.functionName}`);
  
  if (config.emailEndpoint) {
    console.log(`Email: ${config.emailEndpoint}`);
  }
  
  if (config.snsTopicArn) {
    console.log(`SNS Topic: ${config.snsTopicArn}`);
  }
  
  console.log('='.repeat(50));

  try {
    // Setup all alarms
    await setupAllAlarms(config);

    // List created alarms
    console.log('\n');
    await listAlarms(config.region);

    console.log('\n✅ Setup complete!');
    console.log('\nNext steps:');
    console.log('1. Confirm email subscription if you provided an email');
    console.log('2. Test alarms by triggering metric conditions');
    console.log('3. Monitor alarm state in CloudWatch console');
  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { main };
