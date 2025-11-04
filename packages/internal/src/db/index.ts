import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { env } from '@codebuff/internal/env'

import * as schema from './schema'

import type { CodebuffPgDatabase } from './types'

const isLocalTest =
  process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'test' &&
  process.env.CODEBUFF_GITHUB_ACTIONS !== 'true'

let dbInstance: CodebuffPgDatabase

if (isLocalTest) {
  // Provide a minimal stub during local test runs to avoid opening database connections.
  const stub: any = {
    insert: () => {
      throw new Error('DB not available in local tests (use spies/mocks)')
    },
    update: () => {
      throw new Error('DB not available in local tests (use spies/mocks)')
    },
  }
  dbInstance = stub as unknown as CodebuffPgDatabase
} else {
  const client = postgres(env.DATABASE_URL)
  dbInstance = drizzle(client, { schema })
}

export const db: CodebuffPgDatabase = dbInstance
export default db
