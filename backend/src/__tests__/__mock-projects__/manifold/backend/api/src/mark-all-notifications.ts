import { authEndpoint } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const markallnotifications = authEndpoint(async (_req, auth) => {
  const pg = createSupabaseDirectClient()
  await pg.none(
    `update user_notifications
     SET data = jsonb_set(data, '{isSeen}', 'true'::jsonb)
    where user_id = $1
    and data->>'isSeen' = 'false'`,
    [auth.uid]
  )

  return { success: true }
})
