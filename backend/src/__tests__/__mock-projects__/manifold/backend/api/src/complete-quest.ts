import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import { getUser } from 'shared/utils'
import { z } from 'zod'
import { completeSharingQuest } from 'shared/complete-quest-internal'

const bodySchema = z
  .object({
    questType: z.enum(['SHARES'] as const),
  })
  .strict()

export const completequest = authEndpoint(async (req, auth) => {
  validate(bodySchema, req.body)

  const user = await getUser(auth.uid)
  if (!user) throw new APIError(401, 'Your account was not found')
  return await completeSharingQuest(user)
})
