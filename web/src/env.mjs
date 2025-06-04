import { createEnv } from '@t3-oss/env-nextjs'
import dotenv from 'dotenv'
import { z } from 'zod'

dotenv.config({ path: '../stack.env' })
if (!process.env.NEXT_PUBLIC_CB_ENVIRONMENT) {
  throw new Error(
    'NEXT_PUBLIC_CB_ENVIRONMENT is not set, please check `stack.env`'
  )
}
const DOTENV_PATH = process.env.RENDER === 'true' ? '/etc/secrets' : '..'
const path = `${DOTENV_PATH}/.env.${process.env.NEXT_PUBLIC_CB_ENVIRONMENT}`
dotenv.config({ path })

export const env = createEnv({
  server: {
    NEXT_PUBLIC_CB_ENVIRONMENT: z.string().min(1),
    DATABASE_URL: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url().min(1),
    GOOGLE_SITE_VERIFICATION_ID: z.string().optional(),
    GITHUB_ID: z.string().min(1),
    GITHUB_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().url().optional(),
    NEXTAUTH_SECRET: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET_KEY: z.string().min(1),
    STRIPE_USAGE_PRICE_ID: z.string().min(1).startsWith('price_'),
    // STRIPE_TEAM_USAGE_PRICE_ID: z.string().startsWith('price_'),
    STRIPE_TEAM_FEE_PRICE_ID: z.string().startsWith('price_'),
    LOOPS_API_KEY: z.string().min(1),
    DISCORD_PUBLIC_KEY: z.string().min(1),
    DISCORD_BOT_TOKEN: z.string().min(1),
    DISCORD_APPLICATION_ID: z.string().min(1),
  },
  client: {
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_CB_ENVIRONMENT: z.string().min(1),
    NEXT_PUBLIC_SUPPORT_EMAIL: z.string().email().min(1),
    NEXT_PUBLIC_APP_URL: z.string().min(1),
    NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL: z.string().url().min(1),
    NEXT_PUBLIC_LINKEDIN_PARTNER_ID: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_API_KEY: z.string().optional().default(''),
    NEXT_PUBLIC_POSTHOG_HOST_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    NEXT_PUBLIC_CB_ENVIRONMENT: process.env.NEXT_PUBLIC_CB_ENVIRONMENT,
    DATABASE_URL: process.env.DATABASE_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    GOOGLE_SITE_VERIFICATION_ID: process.env.GOOGLE_SITE_VERIFICATION_ID,
    GITHUB_ID: process.env.GITHUB_ID,
    GITHUB_SECRET: process.env.GITHUB_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET_KEY: process.env.STRIPE_WEBHOOK_SECRET_KEY,
    STRIPE_USAGE_PRICE_ID: process.env.STRIPE_USAGE_PRICE_ID,
    // STRIPE_TEAM_USAGE_PRICE_ID: process.env.STRIPE_TEAM_USAGE_PRICE_ID,
    STRIPE_TEAM_FEE_PRICE_ID: process.env.STRIPE_TEAM_FEE_PRICE_ID,
    LOOPS_API_KEY: process.env.LOOPS_API_KEY,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
    NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL:
      process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL,
    NEXT_PUBLIC_LINKEDIN_PARTNER_ID:
      process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID,
    NEXT_PUBLIC_POSTHOG_API_KEY: process.env.NEXT_PUBLIC_POSTHOG_API_KEY,
    NEXT_PUBLIC_POSTHOG_HOST_URL: process.env.NEXT_PUBLIC_POSTHOG_HOST_URL,
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,
  },
})
