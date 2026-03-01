import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";
import { getConfig } from "../config/index.js";

/**
 * Encrypts credential data using AWS KMS
 * @param plaintext - Credential object to encrypt
 * @param keyId - KMS key ID or ARN
 * @returns Base64 encoded encrypted blob
 * @throws Error if encryption fails
 */
export async function encryptCredential(
  plaintext: any,
  keyId: string
): Promise<string> {
  const config = getConfig();
  const client = new KMSClient({ region: config.AWS_REGION });

  try {
    const response = await client.send(
      new EncryptCommand({
        KeyId: keyId,
        Plaintext: Buffer.from(JSON.stringify(plaintext), "utf-8"),
      })
    );

    if (!response.CiphertextBlob) {
      throw new Error("KMS encryption returned no ciphertext");
    }

    return Buffer.from(response.CiphertextBlob).toString("base64");
  } catch (error) {
    console.error("KMS encryption failed:", {
      error: error instanceof Error ? error.message : String(error),
      keyId,
    });
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
export async function decryptCredential(
  ciphertext: string,
  keyId?: string
): Promise<any> {
  const config = getConfig();
  const client = new KMSClient({ region: config.AWS_REGION });

  try {
    const response = await client.send(
      new DecryptCommand({
        CiphertextBlob: Buffer.from(ciphertext, "base64"),
        KeyId: keyId,
      })
    );

    if (!response.Plaintext) {
      throw new Error("KMS decryption returned no plaintext");
    }

    const decryptedString = Buffer.from(response.Plaintext).toString("utf-8");
    return JSON.parse(decryptedString);
  } catch (error) {
    console.error("KMS decryption failed:", {
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error("Failed to decrypt credential");
  }
}
