import { SupabaseClient } from 'common/supabase/utils'

export async function getIsAdmin(db: SupabaseClient, userId: string) {
  const { data } = await db.rpc('is_admin', { input_string: userId })
  return data!
}
