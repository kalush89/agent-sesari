"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptCredential = encryptCredential;
exports.decryptCredential = decryptCredential;
const client_kms_1 = require("@aws-sdk/client-kms");
const index_js_1 = require("../config/index.js");
/**
 * Encrypts credential data using AWS KMS
 * @param plaintext - Credential object to encrypt
 * @param keyId - KMS key ID or ARN
 * @returns Base64 encoded encrypted blob
 * @throws Error if encryption fails
 */
async function encryptCredential(plaintext, keyId) {
    const config = (0, index_js_1.getConfig)();
    const client = new client_kms_1.KMSClient({ region: config.AWS_REGION });
    try {
        const response = await client.send(new client_kms_1.EncryptCommand({
            KeyId: keyId,
            Plaintext: Buffer.from(JSON.stringify(plaintext), "utf-8"),
        }));
        if (!response.CiphertextBlob) {
            throw new Error("KMS encryption returned no ciphertext");
        }
        return Buffer.from(response.CiphertextBlob).toString("base64");
    }
    catch (error) {
        console.error("KMS encryption failed:", {
            error: error instanceof Error ? error.message : String(error),
            keyId,
        });
        // Re-throw the original error if it's already a specific error message
        if (error instanceof Error && error.message === "KMS encryption returned no ciphertext") {
            throw error;
        }
        throw new Error("Failed to encrypt credential");
    }
}
/**
 * Decrypts credential data using AWS KMS
 * @param ciphertext - Base64 encoded encrypted blob
 * @param keyId - KMS key ID or ARN (optional, KMS can infer from ciphertext)
 * @returns Decrypted credential object
 * @throws Error if decryption fails
 */
async function decryptCredential(ciphertext, keyId) {
    const config = (0, index_js_1.getConfig)();
    const client = new client_kms_1.KMSClient({ region: config.AWS_REGION });
    try {
        const response = await client.send(new client_kms_1.DecryptCommand({
            CiphertextBlob: Buffer.from(ciphertext, "base64"),
            KeyId: keyId,
        }));
        if (!response.Plaintext) {
            throw new Error("KMS decryption returned no plaintext");
        }
        const decryptedString = Buffer.from(response.Plaintext).toString("utf-8");
        return JSON.parse(decryptedString);
    }
    catch (error) {
        console.error("KMS decryption failed:", {
            error: error instanceof Error ? error.message : String(error),
        });
        // Re-throw the original error if it's already a specific error message
        if (error instanceof Error && error.message === "KMS decryption returned no plaintext") {
            throw error;
        }
        throw new Error("Failed to decrypt credential");
    }
}
//# sourceMappingURL=encryption.js.map