import { defineConfig } from 'drizzle-kit'
import { env } from './env.mjs'
import path from 'path'

export default defineConfig({
  dialect: 'postgresql',
  schema: path.join('src', 'db', 'schema.ts'),
  out: path.join('src', 'db', 'migrations'),
  dbCredentials: {
    url: env.DATABASE_URL,
  },
})
