import { clientProcessEnv } from '@codebuff/common/env'

import { serverEnvSchema } from './env-schema'

import type { ServerInput } from './env-schema'

// Only log environment in non-production
if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
  console.log('Using environment:', process.env.NEXT_PUBLIC_CB_ENVIRONMENT)
}

// Bun will inject all these values, so we need to reference them individually (no for-loops)
const serverProcessEnv: ServerInput = {
  ...clientProcessEnv,

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
}

export const env = serverEnvSchema.parse(serverProcessEnv)
