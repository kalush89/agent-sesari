import { CredentialRecord } from '../types';
/**
 * Stores a credential record in DynamoDB with retry logic
 * @param record - Credential record to store
 * @returns Stored credential record
 */
export declare function storeCredential(record: CredentialRecord): Promise<CredentialRecord>;
/**
 * Retrieves a credential record from DynamoDB
 * @param userId - User identifier
 * @param serviceName - Service name
 * @returns Credential record or null if not found
 */
export declare function getCredential(userId: string, serviceName: string): Promise<CredentialRecord | null>;
/**
 * Updates a credential record in DynamoDB
 * @param userId - User identifier
 * @param serviceName - Service name
 * @param updates - Fields to update
 * @returns Updated credential record
 */
export declare function updateCredential(userId: string, serviceName: string, updates: Partial<Omit<CredentialRecord, 'user_id' | 'service_name'>>): Promise<CredentialRecord>;
/**
 * Deletes a credential record from DynamoDB
 * @param userId - User identifier
 * @param serviceName - Service name
 */
export declare function deleteCredential(userId: string, serviceName: string): Promise<void>;
/**
 * Lists all credential records for a user
 * @param userId - User identifier
 * @returns Array of credential records
 */
export declare function listCredentials(userId: string): Promise<CredentialRecord[]>;
//# sourceMappingURL=storage.d.ts.map