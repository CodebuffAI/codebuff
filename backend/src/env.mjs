import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../../stack.env') })
if (!process.env.ENVIRONMENT) {
  console.error('ENVIRONMENT is not set, please check `stack.env`')
  process.exit(1)
}

const DOTENV_PATH_PREFIX =
  process.env.RENDER === 'true' ? '/etc/secrets' : path.join(__dirname, '../..')
const DOTENV_PATH = `${DOTENV_PATH_PREFIX}/.env.${process.env.ENVIRONMENT}`
console.log(
  `Using environment: ${process.env.ENVIRONMENT} (path: ${DOTENV_PATH})`
)
dotenv.config({ path: DOTENV_PATH })

export const env = createEnv({
  server: {
    ANTHROPIC_API_KEY: z.string().min(1).startsWith('sk-ant-'),
    ANTHROPIC_API_KEY2: z.string().min(1).startsWith('sk-ant-'),
    HELICONE_API_KEY: z.string().min(1).startsWith('pk-helicone-'),
    OPEN_AI_KEY: z.string().min(1).startsWith('sk-proj-'),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET_KEY: z.string().min(1),
    STRIPE_SUBSCRIPTION_PRICE_ID: z.string().min(1),
    PORT: z.coerce.number().min(1000),
    ENVIRONMENT: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().min(1),
    NEXTAUTH_SECRET: z.string().min(1),
    NEXT_PUBLIC_SUPPORT_EMAIL: z.string().min(1),
  },
  runtimeEnv: process.env,
})
