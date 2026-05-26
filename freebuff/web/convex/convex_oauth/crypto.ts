"use node";

import crypto from "crypto";
import { action } from "../_generated/server";
import { v } from "convex/values";

/**
 * Encryption configuration for OAuth tokens and deploy keys
 * Uses AES-256-GCM for authenticated encryption
 */
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get encryption key from environment variable
 * Key must be 32 bytes (256 bits) encoded as base64
 */
function getEncryptionKey(): Buffer {
  // const keyBase64 = process.env.CONVEX_TOKEN_ENCRYPTION_KEY || "tfHWY+GkAue4r3VT9SrVFoJMZ9P3Eu6N/bdQaC+5BC4=";
  const keyBase64 = "tfHWY+GkAue4r3VT9SrVFoJMZ9P3Eu6N/bdQaC+5BC4=";
  if (!keyBase64) {
    throw new Error(
      "CONVEX_TOKEN_ENCRYPTION_KEY environment variable is not set",
    );
  }

  try {
    const key = Buffer.from(keyBase64, "base64");
    if (key.length !== 32) {
      throw new Error(
        `Encryption key must be 32 bytes (256 bits), got ${key.length} bytes`,
      );
    }
    return key;
  } catch (error) {
    throw new Error(
      `Invalid CONVEX_TOKEN_ENCRYPTION_KEY: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Encrypt a token or secret string using AES-256-GCM
 *
 * @param plaintext The token or secret to encrypt
 * @returns Encrypted string in format: "{iv}:{authTag}:{encrypted}"
 *
 * @example
 * const encrypted = await encryptToken("my-secret-token");
 * // Returns: "a1b2c3d4...:{authTag}:{encryptedData}"
 */
export const encryptToken = action({
  args: {
    plaintext: v.string(),
  },
  returns: v.string(),
  handler: async (_, args) => {
    if (!args.plaintext || args.plaintext.length === 0) {
      throw new Error("Cannot encrypt empty string");
    }

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(args.plaintext, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Format: {iv}:{authTag}:{encrypted}
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
  },
});

/**
 * Decrypt a token or secret string that was encrypted with encryptToken
 *
 * @param encrypted The encrypted string in format: "{iv}:{authTag}:{encrypted}"
 * @returns The decrypted plaintext
 *
 * @example
 * const decrypted = await decryptToken("a1b2c3d4...:{authTag}:{encryptedData}");
 * // Returns: "my-secret-token"
 */
export const decryptToken = action({
  args: {
    encrypted: v.string(),
  },
  returns: v.string(),
  handler: async (_, args) => {
    if (!args.encrypted || args.encrypted.length === 0) {
      throw new Error("Cannot decrypt empty string");
    }

    // Parse the encrypted format
    const parts = args.encrypted.split(":");
    if (parts.length !== 3) {
      throw new Error(
        `Invalid encrypted format. Expected "{iv}:{authTag}:{encrypted}", got ${parts.length} parts`,
      );
    }

    const [ivHex, authTagHex, encryptedHex] = parts;

    try {
      const key = getEncryptionKey();
      const iv = Buffer.from(ivHex, "hex");
      const authTag = Buffer.from(authTagHex, "hex");
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      // Don't leak details about decryption failures (security best practice)
      throw new Error("Failed to decrypt token. Invalid encryption or key.");
    }
  },
});

/**
 * Generate a cryptographically secure random string for OAuth state tokens
 *
 * @param bytes Number of random bytes to generate (default: 32)
 * @returns Hex-encoded random string
 */
export const generateSecureState = action({
  args: {
    bytes: v.optional(v.number()),
  },
  returns: v.string(),
  handler: async (_, args) => {
    const numBytes = args.bytes || 32;
    if (numBytes < 16 || numBytes > 128) {
      throw new Error("Bytes must be between 16 and 128");
    }
    return crypto.randomBytes(numBytes).toString("hex");
  },
});
