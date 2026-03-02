"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateStateToken = generateStateToken;
exports.validateStateToken = validateStateToken;
const crypto_1 = require("crypto");
/**
 * Generates a secure state token for OAuth CSRF protection
 * @param userId - User identifier
 * @returns Base64 encoded state token with HMAC signature
 */
function generateStateToken(userId) {
    const state = {
        userId,
        timestamp: Date.now(),
        nonce: (0, crypto_1.randomBytes)(16).toString('hex')
    };
    const payload = Buffer.from(JSON.stringify(state)).toString('base64');
    const signature = (0, crypto_1.createHmac)('sha256', getStateSecret())
        .update(payload)
        .digest('hex');
    return `${payload}.${signature}`;
}
/**
 * Validates a state token and returns the decoded state
 * @param token - State token to validate
 * @returns Decoded state token
 * @throws Error if token is invalid or expired
 */
function validateStateToken(token) {
    if (!token || typeof token !== 'string') {
        throw new Error('Invalid state token format');
    }
    const parts = token.split('.');
    if (parts.length !== 2) {
        throw new Error('Invalid state token format');
    }
    const [payload, signature] = parts;
    // Verify signature
    const expectedSignature = (0, crypto_1.createHmac)('sha256', getStateSecret())
        .update(payload)
        .digest('hex');
    if (signature !== expectedSignature) {
        throw new Error('Invalid state token signature');
    }
    // Parse and validate timestamp (must be within 10 minutes)
    let state;
    try {
        state = JSON.parse(Buffer.from(payload, 'base64').toString());
    }
    catch (error) {
        throw new Error('Invalid state token payload');
    }
    // Validate state structure
    if (!state.userId || !state.timestamp || !state.nonce) {
        throw new Error('Invalid state token structure');
    }
    // Check expiration (10 minutes)
    const TEN_MINUTES_MS = 10 * 60 * 1000;
    if (Date.now() - state.timestamp > TEN_MINUTES_MS) {
        throw new Error('State token expired');
    }
    return state;
}
/**
 * Gets the state secret from environment variables
 * @returns State secret for HMAC signing
 * @throws Error if STATE_SECRET is not configured
 */
function getStateSecret() {
    const secret = process.env.STATE_SECRET;
    if (!secret) {
        throw new Error('STATE_SECRET environment variable not configured');
    }
    return secret;
}
//# sourceMappingURL=state-manager.js.map