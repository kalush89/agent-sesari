import { ValidationResult } from '../types/index.js';
/**
 * Validates and stores Mixpanel service account credentials
 * @param userId - User identifier
 * @param username - Mixpanel service account username
 * @param secret - Mixpanel service account secret
 * @returns Validation result and stored credential
 */
export declare function validateMixpanelCredentials(userId: string, username: string, secret: string): Promise<ValidationResult>;
//# sourceMappingURL=mixpanel-validation.d.ts.map