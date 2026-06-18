"use node";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

type EncryptedSecretBlobV1 = {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
};

const SECRET_ENCRYPTION_VERSION = 1 as const;

export const getByokEncryptionSecret = () =>
  process.env.BYOK_ENCRYPTION_KEY ||
  process.env.CODEX_AUTH_ENCRYPTION_KEY ||
  process.env.CONVEX_TOKEN_ENCRYPTION_KEY;

const deriveEncryptionKey = (encryptionSecret: string): Buffer =>
  createHash("sha256").update(encryptionSecret, "utf8").digest();

export const encryptByokSecret = (
  plaintextSecret: string,
  encryptionSecret: string,
): { encryptedPayload: string; encryptionVersion: number } | undefined => {
  if (!plaintextSecret || !encryptionSecret) {
    return undefined;
  }

  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      deriveEncryptionKey(encryptionSecret),
      iv,
    );
    const ciphertext = Buffer.concat([
      cipher.update(plaintextSecret, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const blob: EncryptedSecretBlobV1 = {
      version: SECRET_ENCRYPTION_VERSION,
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };

    return {
      encryptedPayload: JSON.stringify(blob),
      encryptionVersion: SECRET_ENCRYPTION_VERSION,
    };
  } catch {
    return undefined;
  }
};

export const decryptByokSecret = (
  encryptedPayload: string,
  encryptionSecret: string,
): string | undefined => {
  if (!encryptedPayload || !encryptionSecret) {
    return undefined;
  }

  try {
    const parsedBlob = JSON.parse(encryptedPayload) as EncryptedSecretBlobV1;
    if (
      parsedBlob.version !== SECRET_ENCRYPTION_VERSION ||
      typeof parsedBlob.iv !== "string" ||
      typeof parsedBlob.authTag !== "string" ||
      typeof parsedBlob.ciphertext !== "string"
    ) {
      return undefined;
    }

    const decipher = createDecipheriv(
      "aes-256-gcm",
      deriveEncryptionKey(encryptionSecret),
      Buffer.from(parsedBlob.iv, "base64"),
    );
    decipher.setAuthTag(Buffer.from(parsedBlob.authTag, "base64"));

    return Buffer.concat([
      decipher.update(Buffer.from(parsedBlob.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return undefined;
  }
};
