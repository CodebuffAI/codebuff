import crypto from 'node:crypto'

import { and, eq } from 'drizzle-orm'

import db from '../db'
import {
  ALGORITHM,
  AUTH_TAG_LENGTH,
  IV_LENGTH,
  KEY_PREFIXES,
  KEY_LENGTHS,
} from './constants'
import * as schema from '../db/schema'
import { env } from '../env.mjs'
import { logger } from '../util/logger'

// Update ApiKeyType to use the enum values
export type ApiKeyType = (typeof schema.apiKeyTypeEnum.enumValues)[number]

/**
 * Encrypts an API key using the secret from environment variables.
 * @param apiKey The plaintext API key to encrypt.
 * @returns The encrypted string including iv and authTag, or throws error.
 */
function encryptApiKeyInternal(apiKey: string): string {
  const secretKey = env.API_KEY_ENCRYPTION_SECRET
  if (Buffer.from(secretKey, 'utf8').length !== 32) {
    throw new Error(
      'Invalid secret key length in environment. Must be 32 bytes.'
    )
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
 * Decrypts an API key string using the secret from environment variables.
 * @param storedValue The encrypted string in format "iv:encrypted:authTag".
 * @returns The decrypted API key string, or null if decryption fails.
 */
function decryptApiKeyInternal(storedValue: string): string | null {
  const secretKey = env.API_KEY_ENCRYPTION_SECRET
  try {
    if (Buffer.from(secretKey, 'utf8').length !== 32) {
      throw new Error(
        'Invalid secret key length in environment. Must be 32 bytes.'
      )
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
 * Encrypts an API key using the environment secret and stores it in the database
 * for a specific user and key type. Overwrites any existing key of the same type
 * for that user.
 * @param userId The ID of the user.
 * @param keyType The type of the API key (e.g., 'gemini').
 * @param apiKey The plaintext API key to encrypt.
 */
export async function encryptAndStoreApiKey(
  userId: string,
  keyType: ApiKeyType,
  apiKey: string
): Promise<void> {
  logger.info({ userId, keyType }, 'Attempting to encrypt and store API key')
  try {
    const encryptedValue = encryptApiKeyInternal(apiKey)

    // Use upsert logic based on the composite primary key (user_id, type)
    await db
      .insert(schema.encryptedApiKeys)
      .values({ user_id: userId, type: keyType, api_key: encryptedValue })
      .onConflictDoUpdate({
        target: [schema.encryptedApiKeys.user_id, schema.encryptedApiKeys.type],
        set: { api_key: encryptedValue },
      })
    logger.info(
      { userId, keyType },
      'Successfully encrypted and stored API key'
    )
  } catch (error) {
    logger.error(
      { error, userId, keyType },
      'API key encryption and storage failed'
    )
    throw new Error(
      `API key encryption and storage failed: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Retrieves and decrypts the stored API key for a specific user and key type
 * using the environment secret. Validates the format for the specific key type.
 * @param userId The ID of the user.
 * @param keyType The type of the API key (e.g., 'gemini').
 * @returns The decrypted API key, or null if not found, decryption fails, or validation fails.
 */
export async function retrieveAndDecryptApiKey(
  userId: string,
  keyType: ApiKeyType
): Promise<string | null> {
  logger.info({ userId, keyType }, 'Attempting to retrieve and decrypt API key')
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
      logger.warn({ userId, keyType }, 'No API key found for user and type')
      return null // No key stored for this user/type
    }

    const decryptedKey = decryptApiKeyInternal(storedValue)

    if (decryptedKey === null) {
      logger.warn({ userId, keyType }, 'API key decryption failed')
      return null // Decryption failed
    }

    // Validate key format based on type
    const prefix = KEY_PREFIXES[keyType]
    const length = KEY_LENGTHS[keyType]

    if (
      (prefix && !decryptedKey.startsWith(prefix)) ||
      (length && decryptedKey.length !== length)
    ) {
      logger.warn(
        { userId, keyType, prefix, length, keyLength: decryptedKey.length },
        'API key validation failed'
      )
      return null // Validation failed
    }

    logger.info(
      { userId, keyType },
      'Successfully retrieved and decrypted API key'
    )
    return decryptedKey
  } catch (error) {
    logger.error(
      { error, userId, keyType },
      'Error retrieving or decrypting API key'
    )
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
  logger.info({ userId, keyType }, 'Attempting to clear API key')
  try {
    const result = await db
      .delete(schema.encryptedApiKeys)
      .where(
        and(
          eq(schema.encryptedApiKeys.user_id, userId),
          eq(schema.encryptedApiKeys.type, keyType)
        )
      )
      .returning() // Return the deleted row to check if something was deleted

    if (result.length > 0) {
      logger.info({ userId, keyType }, 'Successfully cleared API key')
    } else {
      logger.warn({ userId, keyType }, 'No API key found to clear')
    }
  } catch (error) {
    logger.error({ error, userId, keyType }, 'Failed to clear API key')
    throw new Error(
      `Failed to clear API key: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
