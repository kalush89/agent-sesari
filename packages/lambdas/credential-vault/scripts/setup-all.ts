#!/usr/bin/env node
/**
 * Master Infrastructure Setup Script
 * 
 * Orchestrates all infrastructure setup steps in the correct order:
 * 1. DynamoDB table creation
 * 2. KMS key creation
 * 3. IAM role and policy setup
 * 4. Lambda function deployment
 */

import { createCredentialsTable } from './setup-dynamodb';
import { createKMSKey } from './setup-kms';
import { setupIAM } from './setup-iam';
import { deployLambdas } from './deploy-lambdas';

/**
 * Validates required environment variables
 */
function validateEnvironment(): void {
  const required = ['AWS_REGION', 'AWS_ACCOUNT_ID'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  console.log('Environment validation passed ✓\n');
}

/**
 * Runs all infrastructure setup steps
 */
async function setupAll(): Promise<void> {
  console.log('='.repeat(60));
  console.log('Sesari Credential Vault - Infrastructure Setup');
  console.log('='.repeat(60));
  console.log();

  try {
    // Validate environment
    validateEnvironment();

    // Step 1: DynamoDB
    console.log('Step 1/4: Setting up DynamoDB table...');
    await createCredentialsTable();
    console.log();

    // Step 2: KMS
    console.log('Step 2/4: Setting up KMS encryption key...');
    await createKMSKey();
    console.log();

    // Step 3: IAM
    console.log('Step 3/4: Setting up IAM roles and policies...');
    await setupIAM();
    console.log();

    // Step 4: Lambda deployment
    console.log('Step 4/4: Deploying Lambda functions...');
    await deployLambdas();
    console.log();

    console.log('='.repeat(60));
    console.log('✓ Infrastructure setup complete!');
    console.log('='.repeat(60));
    console.log();
    console.log('Next steps:');
    console.log('1. Configure HubSpot OAuth credentials in environment variables');
    console.log('2. Test the API routes in your Next.js application');
    console.log('3. Monitor CloudWatch logs for any issues');
    
  } catch (error) {
    console.error('\n✗ Setup failed:', error instanceof Error ? error.message : 'Unknown error');
    throw error;
  }
}

// Execute if run directly
if (require.main === module) {
  setupAll()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

export { setupAll };
