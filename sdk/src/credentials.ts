import fs from 'fs'
import path from 'node:path'
import os from 'os'

import { env } from '@codebuff/common/env'
import { userSchema } from '@codebuff/common/util/credentials'
import { z } from 'zod/v4'

import type { ClientEnv } from '@codebuff/common/types/contracts/env'
import type { User } from '@codebuff/common/util/credentials'

const credentialsFileSchema = z.object({
  default: userSchema.optional(),
})

const ensureDirectoryExistsSync = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

export const userFromJson = (json: string): User | null => {
  try {
    const credentials = credentialsFileSchema.parse(JSON.parse(json))
    return credentials.default ?? null
  } catch {
    return null
  }
}

/**
 * Get the config directory path based on the environment.
 * Uses the clientEnv to determine the environment suffix.
 */
export const getConfigDir = (clientEnv: ClientEnv = env): string => {
  const envSuffix =
    clientEnv.NEXT_PUBLIC_CB_ENVIRONMENT &&
    clientEnv.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod'
      ? `-${clientEnv.NEXT_PUBLIC_CB_ENVIRONMENT}`
      : ''
  return path.join(os.homedir(), '.config', `manicode${envSuffix}`)
}

/**
 * Get the credentials file path based on the environment.
 */
export const getCredentialsPath = (clientEnv: ClientEnv = env): string => {
  return path.join(getConfigDir(clientEnv), 'credentials.json')
}

export const getUserCredentials = (clientEnv: ClientEnv = env): User | null => {
  const credentialsPath = getCredentialsPath(clientEnv)
  if (!fs.existsSync(credentialsPath)) {
    return null
  }

  try {
    const credentialsFile = fs.readFileSync(credentialsPath, 'utf8')
    const user = userFromJson(credentialsFile)
    return user || null
  } catch (error) {
    console.error('Error reading credentials', error)
    return null
  }
}
