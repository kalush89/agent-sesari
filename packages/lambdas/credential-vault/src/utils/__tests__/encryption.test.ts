import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockClient } from "aws-sdk-client-mock";
import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";
import { encryptCredential, decryptCredential } from "../encryption.js";

const kmsMock = mockClient(KMSClient);

describe("KMS Encryption Utilities", () => {
  beforeEach(() => {
    kmsMock.reset();
    vi.clearAllMocks();
  });

  describe("encryptCredential", () => {
    it("should encrypt credential and return base64 encoded ciphertext", async () => {
      const testCredential = { api_key: "sk_test_12345" };
      const mockCiphertext = Buffer.from("encrypted-data");

      kmsMock.on(EncryptCommand).resolves({
        CiphertextBlob: mockCiphertext,
      });

      const result = await encryptCredential(
        testCredential,
        "arn:aws:kms:us-east-1:123456789012:key/test-key"
      );

      expect(result).toBe(mockCiphertext.toString("base64"));
      expect(kmsMock.calls()).toHaveLength(1);
    });

    it("should throw error when KMS encryption fails", async () => {
      kmsMock.on(EncryptCommand).rejects(new Error("KMS service error"));

      await expect(
        encryptCredential({ api_key: "test" }, "test-key")
      ).rejects.toThrow("Failed to encrypt credential");
    });

    it("should throw error when ciphertext is missing", async () => {
      kmsMock.on(EncryptCommand).resolves({
        CiphertextBlob: undefined,
      });

      await expect(
        encryptCredential({ api_key: "test" }, "test-key")
      ).rejects.toThrow("KMS encryption returned no ciphertext");
    });

    it("should handle complex credential objects", async () => {
      const complexCredential = {
        refresh_token: "rt_12345",
        access_token: "at_67890",
        token_expiry: "2024-12-31T23:59:59Z",
        scope: "crm.objects.read",
      };

      kmsMock.on(EncryptCommand).resolves({
        CiphertextBlob: Buffer.from("encrypted-complex-data"),
      });

      const result = await encryptCredential(complexCredential, "test-key");

      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });
  });

  describe("decryptCredential", () => {
    it("should decrypt ciphertext and return credential object", async () => {
      const testCredential = { api_key: "sk_test_12345" };
      const mockPlaintext = Buffer.from(JSON.stringify(testCredential));

      kmsMock.on(DecryptCommand).resolves({
        Plaintext: mockPlaintext,
      });

      const result = await decryptCredential("base64-encoded-ciphertext");

      expect(result).toEqual(testCredential);
      expect(kmsMock.calls()).toHaveLength(1);
    });

    it("should throw error when KMS decryption fails", async () => {
      kmsMock.on(DecryptCommand).rejects(new Error("KMS service error"));

      await expect(decryptCredential("invalid-ciphertext")).rejects.toThrow(
        "Failed to decrypt credential"
      );
    });

    it("should throw error when plaintext is missing", async () => {
      kmsMock.on(DecryptCommand).resolves({
        Plaintext: undefined,
      });

      await expect(decryptCredential("test-ciphertext")).rejects.toThrow(
        "KMS decryption returned no plaintext"
      );
    });

    it("should handle complex credential objects", async () => {
      const complexCredential = {
        username: "service_account",
        secret: "secret_12345",
      };
      const mockPlaintext = Buffer.from(JSON.stringify(complexCredential));

      kmsMock.on(DecryptCommand).resolves({
        Plaintext: mockPlaintext,
      });

      const result = await decryptCredential("base64-encoded-ciphertext");

      expect(result).toEqual(complexCredential);
    });

    it("should accept optional keyId parameter", async () => {
      const testCredential = { api_key: "test" };
      const mockPlaintext = Buffer.from(JSON.stringify(testCredential));

      kmsMock.on(DecryptCommand).resolves({
        Plaintext: mockPlaintext,
      });

      const result = await decryptCredential(
        "base64-encoded-ciphertext",
        "test-key-id"
      );

      expect(result).toEqual(testCredential);
    });
  });

  describe("Round-trip encryption", () => {
    it("should preserve credential data through encrypt-decrypt cycle", async () => {
      const originalCredential = {
        refresh_token: "rt_test_12345",
        access_token: "at_test_67890",
        token_expiry: "2024-12-31T23:59:59Z",
      };

      // Mock encryption
      const mockCiphertext = Buffer.from("encrypted-data");
      kmsMock.on(EncryptCommand).resolves({
        CiphertextBlob: mockCiphertext,
      });

      const encrypted = await encryptCredential(originalCredential, "test-key");

      // Mock decryption
      const mockPlaintext = Buffer.from(JSON.stringify(originalCredential));
      kmsMock.on(DecryptCommand).resolves({
        Plaintext: mockPlaintext,
      });

      const decrypted = await decryptCredential(encrypted);

      expect(decrypted).toEqual(originalCredential);
    });
  });
});
