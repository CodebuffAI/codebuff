import fs from 'fs'
import path from 'node:path'
import os from 'os'

import { userSchema } from '@codebuff/common/util/credentials'
import { z } from 'zod/v4'

import type { User } from '@codebuff/common/util/credentials'

const credentialsSchema = z
  .object({
    default: userSchema,
  })
  .catchall(userSchema)

const ensureDirectoryExistsSync = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

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
    return
  }
}

export const CONFIG_DIR = path.join(
  os.homedir(),
  '.config',
  'manicode' +
    (process.env.NEXT_PUBLIC_CB_ENVIRONMENT &&
    process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod'
      ? `-${process.env.NEXT_PUBLIC_CB_ENVIRONMENT}`
      : ''),
)

ensureDirectoryExistsSync(CONFIG_DIR)

export const CREDENTIALS_PATH = path.join(CONFIG_DIR, 'credentials.json')

export const getUserCredentials = (): User | null => {
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    return null
  }

  try {
    const credentialsFile = fs.readFileSync(CREDENTIALS_PATH, 'utf8')
    const user = userFromJson(credentialsFile)
    return user || null
  } catch (error) {
    console.error('Error reading credentials', error)
    return null
  }
}
