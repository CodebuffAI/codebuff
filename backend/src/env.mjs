import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config({ path: '../stack.env' })
if (!process.env.ENVIRONMENT) {
  console.error('ENVIRONMENT is not set, please check `stack.env`')
  process.exit(1)
}

const DOTENV_PATH = process.env.ENVIRONMENT === 'local' ? '..' : '/etc/secrets'
const path = `${DOTENV_PATH}/.env.${process.env.ENVIRONMENT}`
console.log(`Using environment: ${process.env.ENVIRONMENT} (path: ${path})`)
dotenv.config({ path })

export const env = createEnv({
  server: {
    ANTHROPIC_API_KEY: z.string().min(1).startsWith('sk-ant-'),
    HELICONE_API_KEY: z.string().min(1).startsWith('pk-helicone-'),
    OPEN_AI_KEY: z.string().min(1).startsWith('sk-proj-'),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET_KEY: z.string().min(1),
    STRIPE_SUBSCRIPTION_PRICE_ID: z.string().min(1),
    PORT: z.coerce.number().min(1000),
    ENVIRONMENT: z.string().min(1),
    APP_URL: z.string().min(1),
    NEXTAUTH_SECRET: z.string().min(1),
  },
  runtimeEnv: process.env,
})
