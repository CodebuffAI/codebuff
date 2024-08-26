import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

export function createReindexTablesJob(...tableNames: string[]) {
  return async () => {
    const pg = createSupabaseDirectClient()
    const indexNames = await pg.map(
      `select indexname from pg_indexes
      where schemaname = 'public' and tablename in ($1:csv)
      order by tablename, indexname`,
      [tableNames],
      (r) => r.indexname
    )
    for (const indexName of indexNames) {
      log(`Reindexing ${indexName}...`)
      await pg.none('reindex index concurrently $1:name', [indexName])
    }
  }
}
