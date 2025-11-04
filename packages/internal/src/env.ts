
import { serverEnvSchema, serverProcessEnv } from './env-schema'
import z from 'zod/v4'


// Only log environment in non-production
if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
  console.log('Using environment:', process.env.NEXT_PUBLIC_CB_ENVIRONMENT)
}

// In local test runs (not CI), provide relaxed defaults so unit tests don't
// require full environment configuration.
const isLocalTest =
  process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'test' &&
  process.env.CODEBUFF_GITHUB_ACTIONS !== 'true'

function withServerDefaults(input: typeof serverProcessEnv) {
  return {
    // Include client defaults via common/env.ts behavior; here we ensure keys exist.
    NEXT_PUBLIC_CB_ENVIRONMENT: input.NEXT_PUBLIC_CB_ENVIRONMENT ?? 'test',
    NEXT_PUBLIC_CODEBUFF_APP_URL:
      input.NEXT_PUBLIC_CODEBUFF_APP_URL ?? 'http://localhost:3000',
    NEXT_PUBLIC_CODEBUFF_BACKEND_URL:
      input.NEXT_PUBLIC_CODEBUFF_BACKEND_URL ?? 'localhost:4000',
    NEXT_PUBLIC_SUPPORT_EMAIL:
      input.NEXT_PUBLIC_SUPPORT_EMAIL ?? 'support@example.com',
    NEXT_PUBLIC_POSTHOG_API_KEY: input.NEXT_PUBLIC_POSTHOG_API_KEY ?? '',
    NEXT_PUBLIC_POSTHOG_HOST_URL:
      input.NEXT_PUBLIC_POSTHOG_HOST_URL ?? 'https://us.i.posthog.com',
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY:
      input.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? 'pk_test_dummy',
    NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL:
      input.NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL ?? 'http://localhost:3000/portal',
    NEXT_PUBLIC_LINKEDIN_PARTNER_ID:
      input.NEXT_PUBLIC_LINKEDIN_PARTNER_ID ?? undefined,
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID:
      input.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID ?? undefined,
    NEXT_PUBLIC_WEB_PORT: input.NEXT_PUBLIC_WEB_PORT ?? 3000,

    // Backend / server defaults
    CODEBUFF_API_KEY: input.CODEBUFF_API_KEY ?? undefined,
    OPEN_ROUTER_API_KEY: input.OPEN_ROUTER_API_KEY ?? 'test-openrouter-key',
    RELACE_API_KEY: input.RELACE_API_KEY ?? 'test-relace-key',
    LINKUP_API_KEY: input.LINKUP_API_KEY ?? 'test-linkup-key',
    CONTEXT7_API_KEY: input.CONTEXT7_API_KEY ?? undefined,
    GOOGLE_CLOUD_PROJECT_ID: input.GOOGLE_CLOUD_PROJECT_ID ?? 'local-project',
    PORT: input.PORT ?? 4000,

    DATABASE_URL:
      input.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/codebuff',
    GOOGLE_SITE_VERIFICATION_ID: input.GOOGLE_SITE_VERIFICATION_ID ?? undefined,
    CODEBUFF_GITHUB_ID: input.CODEBUFF_GITHUB_ID ?? 'github-id',
    CODEBUFF_GITHUB_SECRET: input.CODEBUFF_GITHUB_SECRET ?? 'github-secret',
    NEXTAUTH_URL: input.NEXTAUTH_URL ?? 'http://localhost:3000',
    NEXTAUTH_SECRET: input.NEXTAUTH_SECRET ?? 'nextauth-secret',
    STRIPE_SECRET_KEY: input.STRIPE_SECRET_KEY ?? 'sk_test_dummy',
    STRIPE_WEBHOOK_SECRET_KEY:
      input.STRIPE_WEBHOOK_SECRET_KEY ?? 'whsec_dummy_secret',
    STRIPE_USAGE_PRICE_ID: input.STRIPE_USAGE_PRICE_ID ?? 'price_dummy',
    STRIPE_TEAM_FEE_PRICE_ID: input.STRIPE_TEAM_FEE_PRICE_ID ?? 'price_dummy',
    LOOPS_API_KEY: input.LOOPS_API_KEY ?? 'loops_dummy_key',
    DISCORD_PUBLIC_KEY: input.DISCORD_PUBLIC_KEY ?? 'discord_public_key',
    DISCORD_BOT_TOKEN: input.DISCORD_BOT_TOKEN ?? 'discord_bot_token',
    DISCORD_APPLICATION_ID: input.DISCORD_APPLICATION_ID ?? 'discord_app_id',
    API_KEY_ENCRYPTION_SECRET:
      input.API_KEY_ENCRYPTION_SECRET ?? '0123456789abcdef0123456789abcdef',
  }
}

export const env = isLocalTest
  ? serverEnvSchema.parse(withServerDefaults(serverProcessEnv))
  : serverEnvSchema.parse(serverProcessEnv)
