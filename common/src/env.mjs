import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config({ path: '../stack.env' })
if (!process.env.NEXT_PUBLIC_ENVIRONMENT) {
  console.error('ENVIRONMENT is not set, please check `stack.env`')
  process.exit(1)
}

const DOTENV_PATH = process.env.RENDER === 'true' ? '/etc/secrets' : '..'
const path = `${DOTENV_PATH}/.env.${process.env.NEXT_PUBLIC_ENVIRONMENT}`
console.log(
  `Using environment: ${process.env.NEXT_PUBLIC_ENVIRONMENT} (path: ${path})`
)
dotenv.config({ path })

export const env = createEnv({
  server: {
    ENVIRONMENT: z.string().min(1),
    NEXT_PUBLIC_ENVIRONMENT: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().min(1),
    NEXT_PUBLIC_SUPPORT_EMAIL: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_ENVIRONMENT: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().min(1),
    NEXT_PUBLIC_SUPPORT_EMAIL: z.string().min(1),
  },
  runtimeEnv: process.env,
})
