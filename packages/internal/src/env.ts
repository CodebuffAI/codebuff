import { createEnv } from '@t3-oss/env-nextjs'

import { clientEnvSchema, serverEnvSchema } from './env-schema'

// Only log environment in non-production
if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
  console.log('Using environment:', process.env.NEXT_PUBLIC_CB_ENVIRONMENT)
}

const envSchema = {
  server: serverEnvSchema,
  client: clientEnvSchema,
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
