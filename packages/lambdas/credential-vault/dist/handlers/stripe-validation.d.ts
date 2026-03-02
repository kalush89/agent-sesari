import { ValidationResult } from '../types/index.js';
/**
 * Validates and stores a Stripe API key
 * @param userId - User identifier
 * @param apiKey - Stripe API key (sk_test_* or sk_live_*)
 * @returns Validation result and stored credential
 */
export declare function validateStripeKey(userId: string, apiKey: string): Promise<ValidationResult>;
//# sourceMappingURL=stripe-validation.d.ts.map