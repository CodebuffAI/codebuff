import { defineConfig } from 'drizzle-kit'
import { env } from './env.mjs'
import path from 'path'

export default defineConfig({
  dialect: 'postgresql',
  schema: path.join(__dirname, 'schema.ts'),
  out: './migrations',
  dbCredentials: {
    url: env.DATABASE_URL,
  },
})
