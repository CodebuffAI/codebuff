import { defineConfig } from 'drizzle-kit'
import { env } from './env.mjs'

export default defineConfig({
  dialect: 'postgresql',
  schema: './schema.ts',
  out: './migrations',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
})
