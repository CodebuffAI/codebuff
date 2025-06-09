import { defineConfig } from 'drizzle-kit'
import path from 'path'
import dotenv from 'dotenv'

// Load environment variables following the same pattern as other packages
dotenv.config({ path: path.join(__dirname, '../../../stack.env') })
if (!process.env.NEXT_PUBLIC_CB_ENVIRONMENT) {
  console.error(
    'NEXT_PUBLIC_CB_ENVIRONMENT is not set, please check `stack.env`'
  )
  process.exit(1)
}

const DOTENV_PATH =
  process.env.RENDER === 'true'
    ? '/etc/secrets'
    : path.join(__dirname, '../../..')
const envPath = `${DOTENV_PATH}/.env.${process.env.NEXT_PUBLIC_CB_ENVIRONMENT}`
console.log(
  `Using environment: ${process.env.NEXT_PUBLIC_CB_ENVIRONMENT} (path: ${envPath})`
)
dotenv.config({ path: envPath })

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: path.join(__dirname, 'schema.ts').replace(/\\/g, '/'),
  out: './db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
})
