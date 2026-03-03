#!/usr/bin/env node
/**
 * IAM Role and Policy Setup Script
 * 
 * Creates Lambda execution role with policies for:
 * - KMS encrypt/decrypt operations
 * - DynamoDB operations
 * - CloudWatch logging
 * 
 * Requirements: 2.3, 10.1, 10.2, 10.3
 */

import { 
  IAMClient, 
  CreateRoleCommand, 
  AttachRolePolicyCommand,
  CreatePolicyCommand,
  GetRoleCommand,
  GetPolicyCommand,
  ListPoliciesCommand,
  EntityAlreadyExistsException
} from '@aws-sdk/client-iam';



const ROLE_NAME = 'sesari-credential-vault-lambda-role';
const POLICY_NAME = 'sesari-credential-vault-policy';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;

/**
 * Generates trust policy for Lambda service
 */
function generateTrustPolicy(): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Effect: 'Allow',
        Principal: {
          Service: 'lambda.amazonaws.com'
        },
        Action: 'sts:AssumeRole'
      }
    ]
  });
}

/**
 * Generates IAM policy for credential vault operations
 */
function generateVaultPolicy(accountId: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'KMSOperations',
        Effect: 'Allow',
        Action: [
          'kms:Decrypt',
          'kms:Encrypt',
          'kms:GenerateDataKey',
          'kms:DescribeKey'
        ],
        Resource: `arn:aws:kms:${AWS_REGION}:${accountId}:key/*`,
        Condition: {
          StringEquals: {
            'kms:RequestAlias': 'alias/sesari-credential-vault'
          }
        }
      },
      {
        Sid: 'DynamoDBOperations',
        Effect: 'Allow',
        Action: [
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:UpdateItem',
          'dynamodb:DeleteItem',
          'dynamodb:Query'
        ],
        Resource: `arn:aws:dynamodb:${AWS_REGION}:${accountId}:table/sesari-credentials`
      },
      {
        Sid: 'CloudWatchLogs',
        Effect: 'Allow',
        Action: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents'
        ],
        Resource: `arn:aws:logs:${AWS_REGION}:${accountId}:log-group:/aws/lambda/sesari-*`
      }
    ]
  });
}

/**
 * Creates the Lambda execution role
 */
async function createLambdaRole(): Promise<string> {
  const client = new IAMClient({ region: AWS_REGION });

  if (!AWS_ACCOUNT_ID) {
    throw new Error('AWS_ACCOUNT_ID environment variable is required');
  }

  try {
    // Check if role already exists
    try {
      const roleResponse = await client.send(new GetRoleCommand({ RoleName: ROLE_NAME }));
      console.log(`✓ IAM role "${ROLE_NAME}" already exists`);
      return roleResponse.Role?.Arn || '';
    } catch (error: any) {
      if (error.name !== 'NoSuchEntity') {
        throw error;
      }
    }

    // Create role
    console.log(`Creating IAM role "${ROLE_NAME}"...`);
    
    const createRoleResponse = await client.send(new CreateRoleCommand({
      RoleName: ROLE_NAME,
      AssumeRolePolicyDocument: generateTrustPolicy(),
      Description: 'Execution role for Sesari credential vault Lambda functions',
      Tags: [
        { Key: 'Project', Value: 'Sesari' },
        { Key: 'Component', Value: 'CredentialVault' }
      ]
    }));

    const roleArn = createRoleResponse.Role?.Arn;
    
    if (!roleArn) {
      throw new Error('Failed to retrieve role ARN from creation response');
    }

    console.log(`✓ IAM role created: ${roleArn}`);

    return roleArn;
    
  } catch (error) {
    if (error instanceof EntityAlreadyExistsException) {
      console.log(`✓ IAM role "${ROLE_NAME}" already exists`);
      return `arn:aws:iam::${AWS_ACCOUNT_ID}:role/${ROLE_NAME}`;
    }
    
    console.error('Failed to create IAM role:', error);
    throw new Error(`IAM role creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Creates and attaches the vault policy to the role
 */
async function createAndAttachPolicy(): Promise<string> {
  const client = new IAMClient({ region: AWS_REGION });

  if (!AWS_ACCOUNT_ID) {
    throw new Error('AWS_ACCOUNT_ID environment variable is required');
  }

  try {
    let policyArn = `arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${POLICY_NAME}`;

    // Check if policy already exists
    try {
      await client.send(new GetPolicyCommand({ PolicyArn: policyArn }));
      console.log(`✓ IAM policy "${POLICY_NAME}" already exists`);
    } catch (error: any) {
      if (error.name === 'NoSuchEntity') {
        // Create policy
        console.log(`Creating IAM policy "${POLICY_NAME}"...`);
        
        const createPolicyResponse = await client.send(new CreatePolicyCommand({
          PolicyName: POLICY_NAME,
          PolicyDocument: generateVaultPolicy(AWS_ACCOUNT_ID),
          Description: 'Policy for Sesari credential vault operations',
          Tags: [
            { Key: 'Project', Value: 'Sesari' },
            { Key: 'Component', Value: 'CredentialVault' }
          ]
        }));

        policyArn = createPolicyResponse.Policy?.Arn || policyArn;
        console.log(`✓ IAM policy created: ${policyArn}`);
      } else {
        throw error;
      }
    }

    // Attach policy to role
    console.log(`Attaching policy to role "${ROLE_NAME}"...`);
    
    await client.send(new AttachRolePolicyCommand({
      RoleName: ROLE_NAME,
      PolicyArn: policyArn
    }));

    console.log(`✓ Policy attached successfully`);
    console.log('  - KMS: Encrypt/Decrypt operations');
    console.log('  - DynamoDB: CRUD operations on sesari-credentials table');
    console.log('  - CloudWatch: Log group and stream creation');

    return policyArn;
    
  } catch (error) {
    console.error('Failed to create or attach policy:', error);
    throw new Error(`Policy setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Sets up IAM role and policies
 */
async function setupIAM(): Promise<void> {
  console.log('Setting up IAM role and policies...\n');
  
  const roleArn = await createLambdaRole();
  const policyArn = await createAndAttachPolicy();
  
  console.log('\n✓ IAM setup complete');
  console.log(`\nRole ARN: ${roleArn}`);
  console.log(`Policy ARN: ${policyArn}`);
}

// Execute if run directly
if (require.main === module) {
  setupIAM()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ IAM setup failed:', error.message);
      process.exit(1);
    });
}

export { setupIAM, createLambdaRole, createAndAttachPolicy };
