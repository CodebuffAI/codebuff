import { defineConfig } from 'drizzle-kit'
import path from 'path'
import dotenv from 'dotenv'

// Load environment variables explicitly
dotenv.config({ path: path.join(__dirname, '../../../stack.env') })
const envPath = path.join(__dirname, '../../../.env.local')
dotenv.config({ path: envPath })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: path.join(__dirname, 'schema.ts').replace(/\\/g, '/'),
  out: 'src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
})
