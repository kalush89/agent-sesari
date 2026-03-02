import { DecryptedCredential, ServiceName } from '../types/index.js';
/**
 * Retrieves and decrypts credentials for a service
 * Automatically refreshes expired OAuth tokens before returning
 * @param userId - User identifier
 * @param serviceName - Service to retrieve credentials for
 * @returns Decrypted credential data ready for agent use
 * @throws CredentialError if service is not connected or retrieval fails
 */
export declare function getCredentials(userId: string, serviceName: ServiceName): Promise<DecryptedCredential>;
//# sourceMappingURL=credential-retrieval.d.ts.map