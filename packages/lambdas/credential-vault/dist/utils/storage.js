"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.storeCredential = storeCredential;
exports.getCredential = getCredential;
exports.updateCredential = updateCredential;
exports.deleteCredential = deleteCredential;
exports.listCredentials = listCredentials;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const util_dynamodb_1 = require("@aws-sdk/util-dynamodb");
const client = new client_dynamodb_1.DynamoDBClient({ region: process.env.AWS_REGION });
/**
 * Stores a credential record in DynamoDB with retry logic
 * @param record - Credential record to store
 * @returns Stored credential record
 */
async function storeCredential(record) {
    const params = {
        TableName: process.env.CREDENTIAL_TABLE_NAME,
        Item: (0, util_dynamodb_1.marshall)(record, { removeUndefinedValues: true }),
    };
    try {
        await retryWithBackoff(async () => {
            await client.send(new client_dynamodb_1.PutItemCommand(params));
        });
        return record;
    }
    catch (error) {
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
async function getCredential(userId, serviceName) {
    const params = {
        TableName: process.env.CREDENTIAL_TABLE_NAME,
        Key: (0, util_dynamodb_1.marshall)({
            user_id: userId,
            service_name: serviceName,
        }),
    };
    try {
        const response = await retryWithBackoff(async () => {
            return await client.send(new client_dynamodb_1.GetItemCommand(params));
        });
        if (!response.Item) {
            return null;
        }
        return (0, util_dynamodb_1.unmarshall)(response.Item);
    }
    catch (error) {
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
async function updateCredential(userId, serviceName, updates) {
    // Build update expression dynamically
    const updateExpressions = [];
    const expressionAttributeNames = {};
    const expressionAttributeValues = {};
    Object.entries(updates).forEach(([key, value], index) => {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        updateExpressions.push(`${attrName} = ${attrValue}`);
        expressionAttributeNames[attrName] = key;
        expressionAttributeValues[attrValue] = value;
    });
    const params = {
        TableName: process.env.CREDENTIAL_TABLE_NAME,
        Key: (0, util_dynamodb_1.marshall)({
            user_id: userId,
            service_name: serviceName,
        }),
        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: (0, util_dynamodb_1.marshall)(expressionAttributeValues),
        ReturnValues: 'ALL_NEW',
    };
    try {
        const response = await retryWithBackoff(async () => {
            return await client.send(new client_dynamodb_1.UpdateItemCommand(params));
        });
        if (!response.Attributes) {
            throw new Error('Update failed: No attributes returned');
        }
        return (0, util_dynamodb_1.unmarshall)(response.Attributes);
    }
    catch (error) {
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
async function deleteCredential(userId, serviceName) {
    const params = {
        TableName: process.env.CREDENTIAL_TABLE_NAME,
        Key: (0, util_dynamodb_1.marshall)({
            user_id: userId,
            service_name: serviceName,
        }),
    };
    try {
        await retryWithBackoff(async () => {
            await client.send(new client_dynamodb_1.DeleteItemCommand(params));
        });
    }
    catch (error) {
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
async function listCredentials(userId) {
    const { QueryCommand } = await Promise.resolve().then(() => __importStar(require('@aws-sdk/client-dynamodb')));
    const params = {
        TableName: process.env.CREDENTIAL_TABLE_NAME,
        KeyConditionExpression: 'user_id = :userId',
        ExpressionAttributeValues: (0, util_dynamodb_1.marshall)({
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
        return response.Items.map((item) => (0, util_dynamodb_1.unmarshall)(item));
    }
    catch (error) {
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
async function retryWithBackoff(operation, maxRetries = 3, baseDelay = 100) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await operation();
        }
        catch (error) {
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
function isRetryableError(error) {
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
//# sourceMappingURL=storage.js.map