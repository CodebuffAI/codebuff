import crypto from 'node:crypto'

import { and, eq } from 'drizzle-orm'

import db from '../db'
import * as schema from '../db/schema'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

// Update ApiKeyType to use the enum values
export type ApiKeyType = (typeof schema.apiKeyTypeEnum.enumValues)[number]

// --- Constants for Gemini Key Validation ---
const GEMINI_API_KEY_PREFIX = 'AIzaSy'
const GEMINI_API_KEY_LENGTH = 39

/**
 * Encrypts an API key using the provided secret.
 * @param apiKey The plaintext API key to encrypt.
 * @param secretKey The 32-byte encryption secret key.
 * @returns The encrypted string including iv and authTag, or throws error.
 */
function encryptApiKeyInternal(apiKey: string, secretKey: string): string {
  if (Buffer.from(secretKey, 'utf8').length !== 32) {
    throw new Error('Invalid secret key length. Must be 32 bytes.')
  }
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(secretKey, 'utf8'),
    iv,
    {
      authTagLength: AUTH_TAG_LENGTH,
    }
  )

  let encrypted = cipher.update(apiKey, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  const authTag = cipher.getAuthTag()

  // Return IV, encrypted data, and auth tag together
  return `${iv.toString('hex')}:${encrypted}:${authTag.toString('hex')}`
}

/**
 * Decrypts an API key string using the provided secret.
 * @param storedValue The encrypted string in format "iv:encrypted:authTag".
 * @param secretKey The 32-byte encryption secret key.
 * @returns The decrypted API key string, or null if decryption fails.
 */
function decryptApiKeyInternal(
  storedValue: string,
  secretKey: string
): string | null {
  try {
    if (Buffer.from(secretKey, 'utf8').length !== 32) {
      throw new Error('Invalid secret key length. Must be 32 bytes.')
    }

    const parts = storedValue.split(':')
    if (parts.length !== 3) {
      return null // Invalid format
    }

    const [ivHex, encryptedHex, authTagHex] = parts
    const iv = Buffer.from(ivHex, 'hex')
    const encrypted = Buffer.from(encryptedHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    if (iv.length !== IV_LENGTH) {
      return null
    }

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      Buffer.from(secretKey, 'utf8'),
      iv,
      {
        authTagLength: AUTH_TAG_LENGTH,
      }
    )
    decipher.setAuthTag(authTag)

    let decryptedBuffer = decipher.update(encrypted)
    decryptedBuffer = Buffer.concat([decryptedBuffer, decipher.final()])

    return decryptedBuffer.toString('utf8')
  } catch (error) {
    return null // Decryption failed
  }
}

/**
 * Encrypts an API key using the provided secret and stores it in the database
 * for a specific user and key type. Overwrites any existing key of the same type
 * for that user.
 * @param userId The ID of the user.
 * @param keyType The type of the API key (e.g., 'gemini').
 * @param apiKey The plaintext API key to encrypt.
 * @param secretKey The 32-byte encryption secret key.
 */
export async function encryptAndStoreApiKey(
  userId: string,
  keyType: ApiKeyType,
  apiKey: string,
  secretKey: string
): Promise<void> {
  try {
    const encryptedValue = encryptApiKeyInternal(apiKey, secretKey)

    // Use upsert logic based on the composite primary key (user_id, type)
    await db
      .insert(schema.encryptedApiKeys)
      .values({ user_id: userId, type: keyType, api_key: encryptedValue })
      .onConflictDoUpdate({
        target: [schema.encryptedApiKeys.user_id, schema.encryptedApiKeys.type],
        set: { api_key: encryptedValue },
      })
  } catch (error) {
    throw new Error(
      `API key encryption and storage failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Retrieves and decrypts the stored API key for a specific user and key type
 * using the provided secret. Validates the format for Gemini keys.
 * @param userId The ID of the user.
 * @param keyType The type of the API key (e.g., 'gemini').
 * @param secretKey The 32-byte encryption secret key.
 * @returns The decrypted API key, or null if not found, decryption fails, or validation fails.
 */
export async function retrieveAndDecryptApiKey(
  userId: string,
  keyType: ApiKeyType,
  secretKey: string
): Promise<string | null> {
  try {
    const result = await db.query.encryptedApiKeys.findFirst({
      where: and(
        eq(schema.encryptedApiKeys.user_id, userId),
        eq(schema.encryptedApiKeys.type, keyType)
      ),
      columns: {
        api_key: true, // Select only the encrypted key column
      },
    })

    const storedValue = result?.api_key
    if (!storedValue) {
      return null // No key stored for this user/type
    }

    const decryptedKey = decryptApiKeyInternal(storedValue, secretKey)

    if (decryptedKey === null) {
      return null // Decryption failed
    }

    // --- Add validation specific to Gemini API keys ---
    if (keyType === 'gemini') {
      if (
        !decryptedKey.startsWith(GEMINI_API_KEY_PREFIX) ||
        decryptedKey.length !== GEMINI_API_KEY_LENGTH
      ) {
        return null // Validation failed
      }
    }
    // --- End validation ---

    return decryptedKey
  } catch (error) {
    return null // Error during DB query or other unexpected issue
  }
}

/**
 * Deletes a specific API key entry for a given user and key type.
 * @param userId The ID of the user.
 * @param keyType The type of the API key to delete (e.g., 'gemini').
 */
export async function clearApiKey(
  userId: string,
  keyType: ApiKeyType
): Promise<void> {
  try {
    await db
      .delete(schema.encryptedApiKeys)
      .where(
        and(
          eq(schema.encryptedApiKeys.user_id, userId),
          eq(schema.encryptedApiKeys.type, keyType)
        )
      )
  } catch (error) {
    throw new Error(
      `Failed to clear API key: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
