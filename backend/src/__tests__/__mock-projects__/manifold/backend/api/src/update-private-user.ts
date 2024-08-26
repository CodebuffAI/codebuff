import { APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser as updatePrivateUserData } from 'shared/supabase/users'

export const updatePrivateUser: APIHandler<'me/private/update'> = async (
  props,
  auth
) => {
  const db = createSupabaseDirectClient()
  await updatePrivateUserData(db, auth.uid, props)
}
