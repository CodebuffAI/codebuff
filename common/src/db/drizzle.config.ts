import path from 'path'

import { env } from '@/env'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: path.join(__dirname, 'schema.ts').replace(/\\/g, '/'),
  out: 'src/db/migrations',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
})
