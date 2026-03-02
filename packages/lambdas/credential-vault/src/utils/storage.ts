import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  PutItemCommandInput,
  GetItemCommandInput,
  UpdateItemCommandInput,
  DeleteItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { CredentialRecord } from '../types';

const client = new DynamoDBClient({ region: process.env.AWS_REGION });

/**
 * Stores a credential record in DynamoDB with retry logic
 * @param record - Credential record to store
 * @returns Stored credential record
 */
export async function storeCredential(record: CredentialRecord): Promise<CredentialRecord> {
  const params: PutItemCommandInput = {
    TableName: process.env.CREDENTIAL_TABLE_NAME,
    Item: marshall(record, { removeUndefinedValues: true }),
  };

  try {
    await retryWithBackoff(async () => {
      await client.send(new PutItemCommand(params));
    });

    return record;
  } catch (error) {
    console.error('DynamoDB PutItem failed:', {
      user_id: record.user_id,
      service_name: record.service_name,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to store credential');
  }
}

/**
 * Retrieves a credential record from DynamoDB
 * @param userId - User identifier
 * @param serviceName - Service name
 * @returns Credential record or null if not found
 */
export async function getCredential(
  userId: string,
  serviceName: string
): Promise<CredentialRecord | null> {
  const params: GetItemCommandInput = {
    TableName: process.env.CREDENTIAL_TABLE_NAME,
    Key: marshall({
      user_id: userId,
      service_name: serviceName,
    }),
  };

  try {
    const response = await retryWithBackoff(async () => {
      return await client.send(new GetItemCommand(params));
    });

    if (!response.Item) {
      return null;
    }

    return unmarshall(response.Item) as CredentialRecord;
  } catch (error) {
    console.error('DynamoDB GetItem failed:', {
      user_id: userId,
      service_name: serviceName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to retrieve credential');
  }
}

/**
 * Updates a credential record in DynamoDB
 * @param userId - User identifier
 * @param serviceName - Service name
 * @param updates - Fields to update
 * @returns Updated credential record
 */
export async function updateCredential(
  userId: string,
  serviceName: string,
  updates: Partial<Omit<CredentialRecord, 'user_id' | 'service_name'>>
): Promise<CredentialRecord> {
  // Build update expression dynamically
  const updateExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, any> = {};

  Object.entries(updates).forEach(([key, value], index) => {
    const attrName = `#attr${index}`;
    const attrValue = `:val${index}`;
    updateExpressions.push(`${attrName} = ${attrValue}`);
    expressionAttributeNames[attrName] = key;
    expressionAttributeValues[attrValue] = value;
  });

  const params: UpdateItemCommandInput = {
    TableName: process.env.CREDENTIAL_TABLE_NAME,
    Key: marshall({
      user_id: userId,
      service_name: serviceName,
    }),
    UpdateExpression: `SET ${updateExpressions.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: marshall(expressionAttributeValues),
    ReturnValues: 'ALL_NEW',
  };

  try {
    const response = await retryWithBackoff(async () => {
      return await client.send(new UpdateItemCommand(params));
    });

    if (!response.Attributes) {
      throw new Error('Update failed: No attributes returned');
    }

    return unmarshall(response.Attributes) as CredentialRecord;
  } catch (error) {
    console.error('DynamoDB UpdateItem failed:', {
      user_id: userId,
      service_name: serviceName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to update credential');
  }
}

/**
 * Deletes a credential record from DynamoDB
 * @param userId - User identifier
 * @param serviceName - Service name
 */
export async function deleteCredential(userId: string, serviceName: string): Promise<void> {
  const params: DeleteItemCommandInput = {
    TableName: process.env.CREDENTIAL_TABLE_NAME,
    Key: marshall({
      user_id: userId,
      service_name: serviceName,
    }),
  };

  try {
    await retryWithBackoff(async () => {
      await client.send(new DeleteItemCommand(params));
    });
  } catch (error) {
    console.error('DynamoDB DeleteItem failed:', {
      user_id: userId,
      service_name: serviceName,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to delete credential');
  }
}

// /**
//  * Lists all credential records for a user
//  * @param userId - User identifier
//  * @returns Array of credential records
//  */
// export async function listCredentials(userId: string): Promise<CredentialRecord[]> {
//   const params: QueryCommandInput = {
//     TableName: process.env.CREDENTIAL_TABLE_NAME,
//     KeyConditionExpression: 'user_id = :userId',
//     ExpressionAttributeValues: marshall({
//       ':userId': userId,
//     }),
//   };

//   try {
//     const response = await retryWithBackoff(async () => {
//       return await client.send(new QueryCommand(params));
//     });

//     if (!response.Items || response.Items.length === 0) {
//       return [];
//     }

//     return response.Items.map((item) => unmarshall(item) as CredentialRecord);
//   } catch (error) {
//     console.error('DynamoDB Query failed:', {
//       user_id: userId,
//       error: error instanceof Error ? error.message : 'Unknown error',
//     });
//     throw new Error('Failed to list credentials');
//   }
// }

/**
 * Lists all credential records for a user
 * @param userId - User identifier
 * @returns Array of credential records
 */
export async function listCredentials(userId: string): Promise<CredentialRecord[]> {
  const { QueryCommand } = await import('@aws-sdk/client-dynamodb');

  const params = {
    TableName: process.env.CREDENTIAL_TABLE_NAME,
    KeyConditionExpression: 'user_id = :userId',
    ExpressionAttributeValues: marshall({
      ':userId': userId,
    }),
  };

  try {
    const response = await retryWithBackoff(async () => {
      return await client.send(new QueryCommand(params));
    });

    if (!response.Items || response.Items.length === 0) {
      return [];
    }

    return response.Items.map((item) => unmarshall(item) as CredentialRecord);
  } catch (error) {
    console.error('DynamoDB Query failed:', {
      user_id: userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw new Error('Failed to list credentials');
  }
}


/**
 * Retries an operation with exponential backoff
 * @param operation - Async operation to retry
 * @param maxRetries - Maximum number of retries (default: 3)
 * @param baseDelay - Base delay in milliseconds (default: 100)
 * @returns Result of the operation
 */
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 100
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      // Check if error is retryable
      if (!isRetryableError(error)) {
        throw error;
      }

      // Don't retry if this was the last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Calculate delay with exponential backoff and jitter
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 100;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Checks if an error is retryable
 * @param error - Error to check
 * @returns True if error is retryable
 */
function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const retryableErrors = [
    'ProvisionedThroughputExceededException',
    'ThrottlingException',
    'RequestLimitExceeded',
    'InternalServerError',
    'ServiceUnavailable',
  ];

  return retryableErrors.some((retryableError) => error.name === retryableError);
}
