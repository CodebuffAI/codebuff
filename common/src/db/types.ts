import type * as schema from './schema'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'

export type CodebuffPgDatabase = PgDatabase<
  PostgresJsQueryResultHKT,
  typeof schema
>
