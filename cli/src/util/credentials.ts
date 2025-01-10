import { User, userSchema } from '../../../common/src/util/credentials'
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

export const CREDENTIALS_PATH = path.join(
  os.homedir(),
  '.config',
  'manicode' +
    // on a development stack?
    (process.env.ENVIRONMENT && process.env.ENVIRONMENT !== 'production'
      ? `-${process.env.ENVIRONMENT}`
      : ''),
  'credentials.json'
)
