#!/usr/bin/env node
/**
 * KMS Key Setup Script
 * 
 * Creates a customer-managed KMS key for credential encryption with:
 * - Alias: alias/sesari-credential-vault
 * - Key policy configured for Lambda execution roles
 * 
 * Requirements: 2.3, 10.3
 */

import { 
  KMSClient, 
  CreateKeyCommand, 
  CreateAliasCommand,
  DescribeKeyCommand,
  ListAliasesCommand,
  AlreadyExistsException
} from '@aws-sdk/client-kms';

const KEY_ALIAS = 'alias/sesari-credential-vault';
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;

/**
 * Generates KMS key policy for Lambda execution roles
 */
function generateKeyPolicy(accountId: string): string {
  return JSON.stringify({
    Version: '2012-10-17',
    Statement: [
      {
        Sid: 'Enable IAM User Permissions',
        Effect: 'Allow',
        Principal: {
          AWS: `arn:aws:iam::${accountId}:root`
        },
        Action: 'kms:*',
        Resource: '*'
      },
      {
        Sid: 'Allow Lambda Execution Roles',
        Effect: 'Allow',
        Principal: {
          AWS: [
            `arn:aws:iam::${accountId}:role/sesari-credential-vault-lambda-role`
          ]
        },
        Action: [
          'kms:Decrypt',
          'kms:Encrypt',
          'kms:GenerateDataKey',
          'kms:DescribeKey'
        ],
        Resource: '*'
      },
      {
        Sid: 'Allow CloudWatch Logs',
        Effect: 'Allow',
        Principal: {
          Service: 'logs.amazonaws.com'
        },
        Action: [
          'kms:Decrypt',
          'kms:GenerateDataKey'
        ],
        Resource: '*'
      }
    ]
  });
}

/**
 * Creates the KMS key for credential encryption
 */
async function createKMSKey(): Promise<string> {
  const client = new KMSClient({ region: AWS_REGION });

  if (!AWS_ACCOUNT_ID) {
    throw new Error('AWS_ACCOUNT_ID environment variable is required');
  }

  try {
    // Check if alias already exists
    const aliasesResponse = await client.send(new ListAliasesCommand({}));
    const existingAlias = aliasesResponse.Aliases?.find(a => a.AliasName === KEY_ALIAS);
    
    if (existingAlias && existingAlias.TargetKeyId) {
      console.log(`✓ KMS key with alias "${KEY_ALIAS}" already exists`);
      console.log(`  Key ID: ${existingAlias.TargetKeyId}`);
      return existingAlias.TargetKeyId;
    }

    // Create KMS key
    console.log('Creating KMS key...');
    
    const createKeyResponse = await client.send(new CreateKeyCommand({
      Description: 'Encryption key for Sesari integration credentials',
      KeyUsage: 'ENCRYPT_DECRYPT',
      Origin: 'AWS_KMS',
      MultiRegion: false,
      Policy: generateKeyPolicy(AWS_ACCOUNT_ID),
      Tags: [
        { TagKey: 'Project', TagValue: 'Sesari' },
        { TagKey: 'Component', TagValue: 'CredentialVault' }
      ]
    }));

    const keyId = createKeyResponse.KeyMetadata?.KeyId;
    
    if (!keyId) {
      throw new Error('Failed to retrieve key ID from creation response');
    }

    console.log(`✓ KMS key created: ${keyId}`);

    // Create alias
    console.log(`Creating alias "${KEY_ALIAS}"...`);
    
    await client.send(new CreateAliasCommand({
      AliasName: KEY_ALIAS,
      TargetKeyId: keyId
    }));

    console.log(`✓ Alias "${KEY_ALIAS}" created successfully`);
    console.log('  - Key Usage: ENCRYPT_DECRYPT');
    console.log('  - Multi-Region: false');
    console.log('  - Policy: Lambda execution role access configured');

    return keyId;
    
  } catch (error) {
    if (error instanceof AlreadyExistsException) {
      console.log(`✓ Alias "${KEY_ALIAS}" already exists`);
      return 'existing';
    }
    
    console.error('Failed to create KMS key:', error);
    throw new Error(`KMS key creation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Execute if run directly
if (require.main === module) {
  createKMSKey()
    .then((keyId) => {
      console.log('\n✓ KMS setup complete');
      console.log(`\nTo use this key, set the environment variable:`);
      console.log(`  KMS_KEY_ID=${KEY_ALIAS}`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n✗ KMS setup failed:', error.message);
      process.exit(1);
    });
}

export { createKMSKey };
