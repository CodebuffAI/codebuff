import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'
import dotenv from 'dotenv'

dotenv.config({ path: '../stack.env' })
if (!process.env.NEXT_PUBLIC_CB_ENVIRONMENT) {
  console.error(
    'NEXT_PUBLIC_CB_ENVIRONMENT is not set, please check `stack.env`'
  )
  process.exit(1)
}
console.log(`Using environment: ${process.env.NEXT_PUBLIC_CB_ENVIRONMENT}`)
dotenv.config({ path: `../.env.${process.env.NEXT_PUBLIC_CB_ENVIRONMENT}` })

export const env = createEnv({
  server: {
    ANTHROPIC_API_KEY: z.string().min(1).startsWith('sk-ant-'),
    HELICONE_API_KEY: z.string().min(1).startsWith('pk-helicone-'),
    OPEN_AI_KEY: z.string().min(1).startsWith('sk-proj-'),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET_KEY: z.string().min(1),
    STRIPE_SUBSCRIPTION_PRICE_ID: z.string().min(1),
    PORT: z.coerce.number().min(1000),
    NEXT_PUBLIC_CB_ENVIRONMENT: z.string().min(1),
  },
  runtimeEnv: process.env,
})
