"use strict";
/**
 * Shared TypeScript types for credential vault operations
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CredentialError = exports.ERROR_CODES = void 0;
/**
 * Error codes for credential operations
 */
exports.ERROR_CODES = {
    INVALID_FORMAT: 'INVALID_FORMAT',
    VALIDATION_FAILED: 'VALIDATION_FAILED',
    ENCRYPTION_FAILED: 'ENCRYPTION_FAILED',
    DECRYPTION_FAILED: 'DECRYPTION_FAILED',
    NOT_FOUND: 'NOT_FOUND',
    OAUTH_EXCHANGE_FAILED: 'OAUTH_EXCHANGE_FAILED',
    REFRESH_FAILED: 'REFRESH_FAILED',
    TIMEOUT: 'TIMEOUT',
    STORAGE_FAILED: 'STORAGE_FAILED'
};
/**
 * Custom error class for credential operations
 */
class CredentialError extends Error {
    code;
    serviceName;
    constructor(message, code, serviceName) {
        super(message);
        this.code = code;
        this.serviceName = serviceName;
        this.name = 'CredentialError';
    }
}
exports.CredentialError = CredentialError;
//# sourceMappingURL=index.js.map