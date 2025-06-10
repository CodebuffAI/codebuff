import { User, userSchema } from 'common/util/credentials'
import path from 'node:path'
import os from 'os'
import { z } from 'zod'
import { logger } from './utils/logger'

const credentialsSchema = z
  .object({
    default: userSchema,
  })
  .catchall(userSchema)

export const userFromJson = (
  json: string,
  profileName: string = 'default'
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
      'Error parsing user JSON'
    )
    return
  }
}

import { ensureDirectoryExists } from 'common/util/file'

export const CONFIG_DIR = path.join(
  os.homedir(),
  '.config',
  'manicode' +
    // on a development stack?
    (process.env.NEXT_PUBLIC_CB_ENVIRONMENT &&
    process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod'
      ? `-${process.env.NEXT_PUBLIC_CB_ENVIRONMENT}`
      : '')
)

// Ensure config directory exists
ensureDirectoryExists(CONFIG_DIR)
export const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json')
