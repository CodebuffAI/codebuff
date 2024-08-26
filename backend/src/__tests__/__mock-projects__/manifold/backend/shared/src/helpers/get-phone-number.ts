import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getPhoneNumber = async (userId: string) => {
  const pg = createSupabaseDirectClient()

  return await pg.oneOrNone(
    `select phone_number from private_user_phone_numbers where user_id = $1`,
    [userId],
    (r) => r?.phone_number as string
  )
}
