import {
  SupabaseTransaction,
  createSupabaseDirectClient,
  SERIAL_MODE,
} from './supabase/init'

export const runShortTrans = async <T>(
  callback: (trans: SupabaseTransaction) => Promise<T>
) => {
  const pg = createSupabaseDirectClient()
  return await pg.tx({ mode: SERIAL_MODE }, callback)
}
