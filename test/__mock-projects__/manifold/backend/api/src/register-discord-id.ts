import { APIError, authEndpoint, validate } from 'api/helpers/endpoint'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getPrivateUser } from 'shared/utils'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import { updatePrivateUser } from 'shared/supabase/users'

const bodySchema = z
  .object({
    discordId: z.string(),
  })
  .strict()

export const registerdiscordid = authEndpoint(async (req, auth) => {
  const { discordId } = validate(bodySchema, req.body)
  const pg = createSupabaseDirectClient()

  await updatePrivateUser(pg, auth.uid, { discordId })

  const privateUser = await getPrivateUser(auth.uid)
  if (!privateUser) throw new APIError(500, 'No private user found')
  let apiKey = privateUser.apiKey
  if (!apiKey) {
    apiKey = randomUUID()
    await updatePrivateUser(pg, auth.uid, { apiKey })
  }

  const db = createSupabaseClient()
  const { error } = await db.from('discord_users').upsert({
    discord_user_id: discordId,
    api_key: apiKey,
    user_id: auth.uid,
  })
  if (error) throw new APIError(500, error.message)

  return { success: true }
})
