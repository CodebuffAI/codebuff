import { env } from '@codebuff/internal'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import * as schema from './schema'

import type { CodebuffPgDatabase } from './types'

const client = postgres(env.DATABASE_URL)

export const db: CodebuffPgDatabase = drizzle(client, { schema })
export default db
