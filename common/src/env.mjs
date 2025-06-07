import { createEnv } from '@t3-oss/env-core'
import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config({ path: '../stack.env' })
if (!process.env.NEXT_PUBLIC_CB_ENVIRONMENT) {
  console.error(
    'NEXT_PUBLIC_CB_ENVIRONMENT is not set, please check `stack.env`'
  )
  process.exit(1)
}

const DOTENV_PATH = process.env.RENDER === 'true' ? '/etc/secrets' : '..'
const path = `${DOTENV_PATH}/.env.${process.env.NEXT_PUBLIC_CB_ENVIRONMENT}`
console.log(
  `Using environment: ${process.env.NEXT_PUBLIC_CB_ENVIRONMENT} (path: ${path})`
)
dotenv.config({ path })

export const env = createEnv({
  server: {
    NEXT_PUBLIC_CB_ENVIRONMENT: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_USAGE_PRICE_ID: z.string().min(1).startsWith('price_'),
    // STRIPE_TEAM_USAGE_PRICE_ID: z.string().min(1).startsWith('price_'),
    STRIPE_TEAM_FEE_PRICE_ID: z.string().min(1).startsWith('price_'),
    STRIPE_WEBHOOK_SECRET_KEY: z.string(),
    NEXT_PUBLIC_SUPPORT_EMAIL: z.string().min(1),
    API_KEY_ENCRYPTION_SECRET: z
      .string()
      .length(32, 'API_KEY_ENCRYPTION_SECRET must be 32 characters long'),
    NEXT_PUBLIC_POSTHOG_API_KEY: z.string().min(1),
    NEXT_PUBLIC_POSTHOG_HOST_URL: z.string().url().optional(),
    LOOPS_API_KEY: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_CB_ENVIRONMENT: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().min(1),
    NEXT_PUBLIC_SUPPORT_EMAIL: z.string().min(1),
  },
  runtimeEnv: process.env,
})
