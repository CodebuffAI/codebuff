import type * as schema from './schema'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import type { PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'
import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { PgTransaction } from 'drizzle-orm/pg-core'

export type CodebuffPgDatabase = PgDatabase<
  PostgresJsQueryResultHKT,
  typeof schema
>

/**
 * The type of a Drizzle transaction object for Codebuff's database.
 * This is the `tx` parameter type in `db.transaction(async (tx) => { ... })`.
 * 
 * Use this type when you need the full Drizzle transaction capabilities.
 * For DI/testing scenarios where you only need basic CRUD operations,
 * use `BillingDbConnection` from `@codebuff/common/types/contracts/billing`.
 */
export type CodebuffTransaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>

/**
 * Type for the db.transaction function.
 * Use this to properly type transaction functions in production code.
 * 
 * @example
 * ```typescript
 * import type { CodebuffTransactionFn } from '@codebuff/internal/db/types'
 * 
 * async function myFunction(params: {
 *   deps?: { transaction?: CodebuffTransactionFn }
 * }) {
 *   const transaction = params.deps?.transaction ?? db.transaction.bind(db)
 *   return transaction(async (tx) => {
 *     // tx is fully typed as CodebuffTransaction
 *     await tx.insert(schema.user).values({ ... })
 *   })
 * }
 * ```
 */
export type CodebuffTransactionFn = <T>(
  callback: (tx: CodebuffTransaction) => Promise<T>,
) => Promise<T>
