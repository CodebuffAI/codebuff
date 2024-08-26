import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'

export const getCurrentPrivateUser: APIHandler<'me/private'> = async (
  _,
  auth
) => {
  const pg = createSupabaseDirectClient()
  const privateUser = await pg.oneOrNone(
    `select data from private_users
            where id = $1`,
    [auth.uid],
    (r) => r?.data
  )
  if (!privateUser) throw new APIError(404, 'Your account was not found')
  return privateUser
}
