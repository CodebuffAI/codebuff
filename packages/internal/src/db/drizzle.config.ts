import path from 'path'

import { env } from '@codebuff/internal'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: path.join(__dirname, 'schema.ts').replace(/\\/g, '/'),
  out: 'src/db/migrations',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  tablesFilter: ['*', '!pg_stat_statements', '!pg_stat_statements_info'],
})
