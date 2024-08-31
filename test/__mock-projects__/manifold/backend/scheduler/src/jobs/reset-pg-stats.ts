import { createSupabaseDirectClient } from 'shared/supabase/init'

export async function resetPgStats() {
  const pg = createSupabaseDirectClient()
  await pg.none(`select pg_stat_statements_reset()`)
}
