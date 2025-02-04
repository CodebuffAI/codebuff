import { User, userSchema } from 'common/util/credentials'
import { z } from 'zod'
import os from 'os'
import path from 'node:path'

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
    return
  }
}

import { ensureDirectoryExists } from 'common/util/file'

export const CONFIG_DIR = path.join(
  os.homedir(),
  '.config',
  'manicode' +
    // on a development stack?
    (process.env.ENVIRONMENT && process.env.ENVIRONMENT !== 'production'
      ? `-${process.env.ENVIRONMENT}`
      : '')
)

// Ensure config directory exists
ensureDirectoryExists(CONFIG_DIR)
export const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json')
