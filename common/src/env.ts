import { clientEnvSchema, clientProcessEnv } from './env-schema'
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

function withClientDefaults(input: typeof clientProcessEnv) {
  return {
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
  }
}

export const env = isLocalTest
  ? clientEnvSchema.parse(withClientDefaults(clientProcessEnv))
  : clientEnvSchema.parse(clientProcessEnv)
