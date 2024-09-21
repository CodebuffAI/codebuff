import { z } from 'zod'

const userSchema = z.object({
  email: z.string(),
  name: z.string(),
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
