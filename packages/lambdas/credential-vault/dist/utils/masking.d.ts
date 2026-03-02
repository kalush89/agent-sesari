/**
 * Credential masking utilities for secure UI display
 *
 * Masks sensitive credential data by showing only the last N characters
 * and replacing all other characters with asterisks.
 */
import { CredentialType, CredentialPayload } from '../types/index.js';
/**
 * Masks a credential value for safe display
 *
 * @param value - Full credential value to mask
 * @param visibleChars - Number of characters to show at end (default: 4)
 * @returns Masked string (e.g., "****1234")
 */
export declare function maskCredential(value: string, visibleChars?: number): string;
/**
 * Generates display-friendly masked value based on credential type
 *
 * Applies masking only to sensitive fields:
 * - OAuth: Shows "Connected" (no sensitive data exposed)
 * - API Key: Masks api_key showing last 4 characters
 * - Service Account: Shows username plaintext, masks secret
 *
 * @param credentialType - Type of credential
 * @param data - Decrypted credential data
 * @returns Masked display string
 */
export declare function generateMaskedDisplay(credentialType: CredentialType, data: CredentialPayload): string;
//# sourceMappingURL=masking.d.ts.map