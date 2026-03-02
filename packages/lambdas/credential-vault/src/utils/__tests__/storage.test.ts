import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import {
  storeCredential,
  getCredential,
  updateCredential,
  deleteCredential,
} from '../storage';
import { CredentialRecord } from '../../types';

const dynamoMock = mockClient(DynamoDBClient);

describe('DynamoDB Storage Operations', () => {
  beforeEach(() => {
    dynamoMock.reset();
    vi.clearAllMocks();
    process.env.CREDENTIAL_TABLE_NAME = 'test-credentials-table';
    process.env.AWS_REGION = 'us-east-1';
  });

  describe('storeCredential', () => {
    it('should store a credential record successfully', async () => {
      const record: CredentialRecord = {
        user_id: 'user123',
        service_name: 'stripe',
        credential_type: 'api_key',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        encrypted_data: 'encrypted_blob',
        display_name: 'Stripe',
        masked_value: '****1234',
      };

      dynamoMock.on(PutItemCommand).resolves({});

      const result = await storeCredential(record);

      expect(result).toEqual(record);
      expect(dynamoMock.calls()).toHaveLength(1);
    });

    it('should retry on transient failures', async () => {
      const record: CredentialRecord = {
        user_id: 'user123',
        service_name: 'stripe',
        credential_type: 'api_key',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        encrypted_data: 'encrypted_blob',
        display_name: 'Stripe',
        masked_value: '****1234',
      };

      // Fail twice, then succeed
      dynamoMock
        .on(PutItemCommand)
        .rejectsOnce(
          Object.assign(new Error('Throttled'), {
            name: 'ThrottlingException',
          })
        )
        .rejectsOnce(
          Object.assign(new Error('Throttled'), {
            name: 'ThrottlingException',
          })
        )
        .resolves({});

      const result = await storeCredential(record);

      expect(result).toEqual(record);
      expect(dynamoMock.calls()).toHaveLength(3);
    });

    it('should throw error after max retries', async () => {
      const record: CredentialRecord = {
        user_id: 'user123',
        service_name: 'stripe',
        credential_type: 'api_key',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        encrypted_data: 'encrypted_blob',
        display_name: 'Stripe',
        masked_value: '****1234',
      };

      dynamoMock.on(PutItemCommand).rejects(
        Object.assign(new Error('Throttled'), {
          name: 'ThrottlingException',
        })
      );

      await expect(storeCredential(record)).rejects.toThrow('Failed to store credential');
      expect(dynamoMock.calls()).toHaveLength(4); // Initial + 3 retries
    });

    it('should not retry on non-retryable errors', async () => {
      const record: CredentialRecord = {
        user_id: 'user123',
        service_name: 'stripe',
        credential_type: 'api_key',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        encrypted_data: 'encrypted_blob',
        display_name: 'Stripe',
        masked_value: '****1234',
      };

      dynamoMock.on(PutItemCommand).rejects(
        Object.assign(new Error('Validation error'), {
          name: 'ValidationException',
        })
      );

      await expect(storeCredential(record)).rejects.toThrow('Failed to store credential');
      expect(dynamoMock.calls()).toHaveLength(1); // No retries
    });
  });

  describe('getCredential', () => {
    it('should retrieve a credential record successfully', async () => {
      const record: CredentialRecord = {
        user_id: 'user123',
        service_name: 'stripe',
        credential_type: 'api_key',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        encrypted_data: 'encrypted_blob',
        display_name: 'Stripe',
        masked_value: '****1234',
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(record),
      });

      const result = await getCredential('user123', 'stripe');

      expect(result).toEqual(record);
      expect(dynamoMock.calls()).toHaveLength(1);
    });

    it('should return null when credential not found', async () => {
      dynamoMock.on(GetItemCommand).resolves({});

      const result = await getCredential('user123', 'nonexistent');

      expect(result).toBeNull();
    });

    it('should retry on transient failures', async () => {
      const record: CredentialRecord = {
        user_id: 'user123',
        service_name: 'stripe',
        credential_type: 'api_key',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
        encrypted_data: 'encrypted_blob',
        display_name: 'Stripe',
        masked_value: '****1234',
      };

      dynamoMock
        .on(GetItemCommand)
        .rejectsOnce(
          Object.assign(new Error('Service unavailable'), {
            name: 'ServiceUnavailable',
          })
        )
        .resolves({
          Item: marshall(record),
        });

      const result = await getCredential('user123', 'stripe');

      expect(result).toEqual(record);
      expect(dynamoMock.calls()).toHaveLength(2);
    });

    it('should throw error on permanent failure', async () => {
      dynamoMock.on(GetItemCommand).rejects(
        Object.assign(new Error('Access denied'), {
          name: 'AccessDeniedException',
        })
      );

      await expect(getCredential('user123', 'stripe')).rejects.toThrow(
        'Failed to retrieve credential'
      );
    });
  });

  describe('updateCredential', () => {
    it('should update a credential record successfully', async () => {
      const updates = {
        encrypted_data: 'new_encrypted_blob',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const updatedRecord: CredentialRecord = {
        user_id: 'user123',
        service_name: 'stripe',
        credential_type: 'api_key',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        encrypted_data: 'new_encrypted_blob',
        display_name: 'Stripe',
        masked_value: '****1234',
      };

      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedRecord),
      });

      const result = await updateCredential('user123', 'stripe', updates);

      expect(result).toEqual(updatedRecord);
      expect(dynamoMock.calls()).toHaveLength(1);
    });

    it('should handle multiple field updates', async () => {
      const updates = {
        encrypted_data: 'new_encrypted_blob',
        updated_at: '2024-01-02T00:00:00Z',
        masked_value: '****5678',
      };

      const updatedRecord: CredentialRecord = {
        user_id: 'user123',
        service_name: 'stripe',
        credential_type: 'api_key',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        encrypted_data: 'new_encrypted_blob',
        display_name: 'Stripe',
        masked_value: '****5678',
      };

      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedRecord),
      });

      const result = await updateCredential('user123', 'stripe', updates);

      expect(result).toEqual(updatedRecord);
    });

    it('should retry on transient failures', async () => {
      const updates = {
        encrypted_data: 'new_encrypted_blob',
        updated_at: '2024-01-02T00:00:00Z',
      };

      const updatedRecord: CredentialRecord = {
        user_id: 'user123',
        service_name: 'stripe',
        credential_type: 'api_key',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
        encrypted_data: 'new_encrypted_blob',
        display_name: 'Stripe',
        masked_value: '****1234',
      };

      dynamoMock
        .on(UpdateItemCommand)
        .rejectsOnce(
          Object.assign(new Error('Provisioned throughput exceeded'), {
            name: 'ProvisionedThroughputExceededException',
          })
        )
        .resolves({
          Attributes: marshall(updatedRecord),
        });

      const result = await updateCredential('user123', 'stripe', updates);

      expect(result).toEqual(updatedRecord);
      expect(dynamoMock.calls()).toHaveLength(2);
    });

    it('should throw error when no attributes returned', async () => {
      const updates = {
        encrypted_data: 'new_encrypted_blob',
        updated_at: '2024-01-02T00:00:00Z',
      };

      dynamoMock.on(UpdateItemCommand).resolves({});

      await expect(updateCredential('user123', 'stripe', updates)).rejects.toThrow(
        'Failed to update credential'
      );
    });
  });

  describe('deleteCredential', () => {
    it('should delete a credential record successfully', async () => {
      dynamoMock.on(DeleteItemCommand).resolves({});

      await expect(deleteCredential('user123', 'stripe')).resolves.toBeUndefined();
      expect(dynamoMock.calls()).toHaveLength(1);
    });

    it('should retry on transient failures', async () => {
      dynamoMock
        .on(DeleteItemCommand)
        .rejectsOnce(
          Object.assign(new Error('Internal server error'), {
            name: 'InternalServerError',
          })
        )
        .resolves({});

      await expect(deleteCredential('user123', 'stripe')).resolves.toBeUndefined();
      expect(dynamoMock.calls()).toHaveLength(2);
    });

    it('should throw error on permanent failure', async () => {
      dynamoMock.on(DeleteItemCommand).rejects(
        Object.assign(new Error('Resource not found'), {
          name: 'ResourceNotFoundException',
        })
      );

      await expect(deleteCredential('user123', 'stripe')).rejects.toThrow(
        'Failed to delete credential'
      );
    });
  });
});
