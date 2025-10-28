import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

// Only log environment in non-production
if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
  console.log('Using environment:', process.env.NEXT_PUBLIC_CB_ENVIRONMENT)
}

const envSchema = {
  server: {
    // Backend variables
    CODEBUFF_API_KEY: z.string().optional(),
    OPEN_ROUTER_API_KEY: z.string().min(1),
    RELACE_API_KEY: z.string().min(1),
    LINKUP_API_KEY: z.string().min(1),
    CONTEXT7_API_KEY: z.string().optional(),
    GOOGLE_CLOUD_PROJECT_ID: z.string().min(1),
    PORT: z.coerce.number().min(1000),

    // Web/Database variables
    DATABASE_URL: z.string().min(1),
    GOOGLE_SITE_VERIFICATION_ID: z.string().optional(),
    CODEBUFF_GITHUB_ID: z.string().min(1),
    CODEBUFF_GITHUB_SECRET: z.string().min(1),
    NEXTAUTH_URL: z.string().url().optional(),
    NEXTAUTH_SECRET: z.string().min(1),
    STRIPE_SECRET_KEY: z.string().min(1),
    STRIPE_WEBHOOK_SECRET_KEY: z.string().min(1),
    STRIPE_USAGE_PRICE_ID: z.string().min(1),
    STRIPE_TEAM_FEE_PRICE_ID: z.string().min(1),
    LOOPS_API_KEY: z.string().min(1),
    DISCORD_PUBLIC_KEY: z.string().min(1),
    DISCORD_BOT_TOKEN: z.string().min(1),
    DISCORD_APPLICATION_ID: z.string().min(1),

    // Common variables
    API_KEY_ENCRYPTION_SECRET: z.string().length(32),
  },
  client: {
    NEXT_PUBLIC_CB_ENVIRONMENT: z.string().min(1),
    NEXT_PUBLIC_CODEBUFF_APP_URL: z.string().url().min(1),
    NEXT_PUBLIC_CODEBUFF_BACKEND_URL: z.string().min(1),
    NEXT_PUBLIC_SUPPORT_EMAIL: z.string().email().min(1),
    NEXT_PUBLIC_POSTHOG_API_KEY: z.string().optional().default(''),
    NEXT_PUBLIC_POSTHOG_HOST_URL: z.string().url().optional(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL: z.string().url().min(1),
    NEXT_PUBLIC_LINKEDIN_PARTNER_ID: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID: z.string().optional(),
    NEXT_PUBLIC_WEB_PORT: z.coerce.number().min(1000).optional().default(3000),
  },
  runtimeEnv: {
    // Backend variables
    CODEBUFF_API_KEY: process.env.CODEBUFF_API_KEY,
    OPEN_ROUTER_API_KEY: process.env.OPEN_ROUTER_API_KEY,
    RELACE_API_KEY: process.env.RELACE_API_KEY,
    LINKUP_API_KEY: process.env.LINKUP_API_KEY,
    CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY,
    GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID,
    PORT: process.env.PORT,

    // Web/Database variables
    DATABASE_URL: process.env.DATABASE_URL,
    GOOGLE_SITE_VERIFICATION_ID: process.env.GOOGLE_SITE_VERIFICATION_ID,
    CODEBUFF_GITHUB_ID: process.env.CODEBUFF_GITHUB_ID,
    CODEBUFF_GITHUB_SECRET: process.env.CODEBUFF_GITHUB_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET_KEY: process.env.STRIPE_WEBHOOK_SECRET_KEY,
    STRIPE_USAGE_PRICE_ID: process.env.STRIPE_USAGE_PRICE_ID,
    STRIPE_TEAM_FEE_PRICE_ID: process.env.STRIPE_TEAM_FEE_PRICE_ID,
    LOOPS_API_KEY: process.env.LOOPS_API_KEY,
    DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
    DISCORD_BOT_TOKEN: process.env.DISCORD_BOT_TOKEN,
    DISCORD_APPLICATION_ID: process.env.DISCORD_APPLICATION_ID,

    // Common variables
    API_KEY_ENCRYPTION_SECRET: process.env.API_KEY_ENCRYPTION_SECRET,

    // Client variables
    NEXT_PUBLIC_CB_ENVIRONMENT: process.env.NEXT_PUBLIC_CB_ENVIRONMENT,
    NEXT_PUBLIC_CODEBUFF_APP_URL: process.env.NEXT_PUBLIC_CODEBUFF_APP_URL,
    NEXT_PUBLIC_CODEBUFF_BACKEND_URL:
      process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL,
    NEXT_PUBLIC_SUPPORT_EMAIL: process.env.NEXT_PUBLIC_SUPPORT_EMAIL,
    NEXT_PUBLIC_POSTHOG_API_KEY: process.env.NEXT_PUBLIC_POSTHOG_API_KEY,
    NEXT_PUBLIC_POSTHOG_HOST_URL: process.env.NEXT_PUBLIC_POSTHOG_HOST_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL:
      process.env.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL,
    NEXT_PUBLIC_LINKEDIN_PARTNER_ID:
      process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID,
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID:
      process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID,
    NEXT_PUBLIC_WEB_PORT: process.env.NEXT_PUBLIC_WEB_PORT,
  },
}
let envTemp
try {
  envTemp = createEnv(envSchema)
} catch (error) {
  console.error(
    "\nERROR: Environment variables not loaded. It looks like you're missing some required environment variables.\nPlease run commands using the project's runner (e.g., 'infisical run -- <your-command>') to load them automatically.",
  )

  throw error
}
export const env = envTemp
