/**
 * Credential masking utilities for secure UI display
 * 
 * Masks sensitive credential data by showing only the last N characters
 * and replacing all other characters with asterisks.
 */

import {
  CredentialType,
  APIKeyCredential,
  ServiceAccountCredential,
  CredentialPayload
} from '../types/index.js';

/**
 * Masks a credential value for safe display
 * 
 * @param value - Full credential value to mask
 * @param visibleChars - Number of characters to show at end (default: 4)
 * @returns Masked string (e.g., "****1234")
 */
export function maskCredential(value: string, visibleChars: number = 4): string {
  if (!value || value.length === 0) {
    return '';
  }
  
  if (value.length <= visibleChars) {
    return '*'.repeat(value.length);
  }
  
  const masked = '*'.repeat(value.length - visibleChars);
  const visible = value.slice(-visibleChars);
  
  return masked + visible;
}

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
export function generateMaskedDisplay(
  credentialType: CredentialType,
  data: CredentialPayload
): string {
  switch (credentialType) {
    case 'oauth': {
      // OAuth credentials show generic "Connected" status
      // refresh_token and access_token are never displayed
      return 'Connected';
    }
    
    case 'api_key': {
      const apiKeyData = data as APIKeyCredential;
      return maskCredential(apiKeyData.api_key);
    }
    
    case 'service_account': {
      const serviceAccountData = data as ServiceAccountCredential;
      // Username is non-sensitive, only mask the secret
      return `${serviceAccountData.username} / ${maskCredential(serviceAccountData.secret)}`;
    }
    
    default:
      return 'Connected';
  }
}
