import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import { z } from 'zod'
import { trackPublicEvent } from 'shared/analytics'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { isAdminId } from 'common/envs/constants'
import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'

const bodySchema = z
  .object({
    userId: z.string(),
    unban: z.boolean().optional(),
  })
  .strict()

export const banuser = authEndpoint(async (req, auth) => {
  const { userId, unban } = validate(bodySchema, req.body)
  const db = createSupabaseDirectClient()
  await throwErrorIfNotMod(auth.uid)
  if (isAdminId(userId)) throw new APIError(403, 'Cannot ban admin')
  await trackPublicEvent(auth.uid, 'ban user', {
    userId,
  })
  await updateUser(db, userId, {
    isBannedFromPosting: !unban,
  })
  log('updated user')
  return { success: true }
})
