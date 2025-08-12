import type { User } from '@codebuff/common/util/credentials'

import { z } from 'zod/v4'

import { logger } from './utils/logger'

import { existsSync, readFileSync } from 'fs'
import path from 'node:path'
import os from 'os'

import { userSchema } from '@codebuff/common/util/credentials'

const credentialsSchema = z
  .object({
    default: userSchema,
  })
  .catchall(userSchema)

export const userFromJson = (
  json: string,
  profileName: string = 'default',
): User | undefined => {
  try {
    const allCredentials = credentialsSchema.parse(JSON.parse(json))
    const profile = allCredentials[profileName]
    return profile
  } catch (error) {
    console.error('Error parsing user JSON:', error)
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        profileName,
      },
      'Error parsing user JSON',
    )
    return
  }
}

import { ensureDirectoryExists } from '@codebuff/common/util/file'

export const CONFIG_DIR = path.join(
  os.homedir(),
  '.config',
  'manicode' +
    // on a development stack?
    (process.env.NEXT_PUBLIC_CB_ENVIRONMENT &&
    process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod'
      ? `-${process.env.NEXT_PUBLIC_CB_ENVIRONMENT}`
      : ''),
)

// Ensure config directory exists
ensureDirectoryExists(CONFIG_DIR)
export const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json')

/**
 * Get user credentials from file system
 * @returns User object or null if not found/authenticated
 */
export const getUserCredentials = (): User | null => {
  // Read user credentials directly from file
  if (!existsSync(CREDENTIALS_PATH)) {
    return null
  }

  try {
    const credentialsFile = readFileSync(CREDENTIALS_PATH, 'utf8')
    const user = userFromJson(credentialsFile)
    return user || null
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error reading credentials',
    )
    return null
  }
}
