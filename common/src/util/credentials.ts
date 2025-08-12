import crypto from 'node:crypto'

import { z } from 'zod/v4'

export const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  authToken: z.string(),
  fingerprintId: z.string(),
  fingerprintHash: z.string(),
})

export type User = z.infer<typeof userSchema>

export const genAuthCode = (
  fingerprintId: string,
  expiresAt: string,
  secret: string,
) =>
  crypto
    .createHash('sha256')
    .update(secret)
    .update(fingerprintId)
    .update(expiresAt)
    .digest('hex')
