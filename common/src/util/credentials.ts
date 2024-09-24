import { z } from 'zod'
import crypto from 'node:crypto'
import os from 'os'
import path from 'node:path'

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  authToken: z.string(),
  fingerprintId: z.string(),
})

export type User = z.infer<typeof userSchema>

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

export const genAuthCode = (
  fingerprintId: string,
  expiresAt: string,
  secret: string
) =>
  crypto
    .createHash('sha256')
    .update(secret)
    .update(fingerprintId)
    .update(expiresAt)
    .digest('hex')

export const CREDENTIALS_PATH = path.join(
  os.homedir(),
  '.config',
  'manicode',
  'credentials.json'
)
