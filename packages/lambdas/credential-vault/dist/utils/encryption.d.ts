/**
 * Encrypts credential data using AWS KMS
 * @param plaintext - Credential object to encrypt
 * @param keyId - KMS key ID or ARN
 * @returns Base64 encoded encrypted blob
 * @throws Error if encryption fails
 */
export declare function encryptCredential(plaintext: any, keyId: string): Promise<string>;
/**
 * Decrypts credential data using AWS KMS
 * @param ciphertext - Base64 encoded encrypted blob
 * @param keyId - KMS key ID or ARN (optional, KMS can infer from ciphertext)
 * @returns Decrypted credential object
 * @throws Error if decryption fails
 */
export declare function decryptCredential(ciphertext: string, keyId?: string): Promise<any>;
//# sourceMappingURL=encryption.d.ts.map