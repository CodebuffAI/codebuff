import { createEnv } from '@t3-oss/env-nextjs'
import dotenv from 'dotenv'
import { z } from 'zod'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = path.dirname(__filename); // get the name of the directory

dotenv.config({ path: path.resolve(__dirname, '../../stack.env') })
if (!process.env.NEXT_PUBLIC_ENVIRONMENT) {
  throw new Error(
    'NEXT_PUBLIC_ENVIRONMENT is not set, please check `stack.env`'
  )
}
const DOTENV_PATH = process.env.RENDER === 'true' ? '/etc/secrets' : '..'
const fp = `${DOTENV_PATH}/.env.${process.env.ENVIRONMENT}`
dotenv.config({ path: fp })

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url().min(1),
    GOOGLE_SITE_VERIFICATION_ID: z.string().optional(),
    GITHUB_ID: z.string().min(1),
    GITHUB_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().url().optional(),
    NEXTAUTH_SECRET: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET_KEY: z.string().min(1),
    STRIPE_SUBSCRIPTION_PRICE_ID: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_ENVIRONMENT: z.string().min(1),
    NEXT_PUBLIC_SUPPORT_EMAIL: z.string().email().min(1),
    NEXT_PUBLIC_APP_URL: z.string().min(1),
    NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL: z.string().url().min(1),
  },
  runtimeEnv: {
    NEXT_PUBLIC_ENVIRONMENT: process.env.NEXT_PUBLIC_ENVIRONMENT,
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    GOOGLE_SITE_VERIFICATION_ID: process.env.GOOGLE_SITE_VERIFICATION_ID,
    GITHUB_ID: process.env.GITHUB_ID,
    GITHUB_SECRET: process.env.GITHUB_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET_KEY: process.env.STRIPE_WEBHOOK_SECRET_KEY,
    STRIPE_SUBSCRIPTION_PRICE_ID: process.env.STRIPE_SUBSCRIPTION_PRICE_ID,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL: process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL,
  },
})
