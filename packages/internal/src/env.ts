
import { serverEnvSchema, serverProcessEnv } from './env-schema'

// Provide safe defaults for local/test runs to avoid schema failures
const ensureEnvDefault = (key: string, value: string) => {
  if (!process.env[key]) {
    process.env[key] = value
  }
}

ensureEnvDefault('NEXT_PUBLIC_CB_ENVIRONMENT', 'dev')
ensureEnvDefault('NEXT_PUBLIC_CODEBUFF_APP_URL', 'http://localhost:3000')
ensureEnvDefault('NEXT_PUBLIC_CODEBUFF_BACKEND_URL', 'localhost:4242')
ensureEnvDefault('NEXT_PUBLIC_SUPPORT_EMAIL', 'support@codebuff.local')
ensureEnvDefault('NEXT_PUBLIC_POSTHOG_HOST_URL', 'http://localhost')
ensureEnvDefault('NEXT_PUBLIC_POSTHOG_API_KEY', 'test-key')
ensureEnvDefault('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY', 'pk_test_dummy')
ensureEnvDefault('NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL', 'http://localhost/portal')
ensureEnvDefault('OPEN_ROUTER_API_KEY', 'test')
ensureEnvDefault('OPENAI_API_KEY', 'test')
ensureEnvDefault('RELACE_API_KEY', 'test')
ensureEnvDefault('LINKUP_API_KEY', 'test')
ensureEnvDefault('GOOGLE_CLOUD_PROJECT_ID', 'test-project')
ensureEnvDefault('PORT', '4242')
ensureEnvDefault('DATABASE_URL', 'postgres://user:pass@localhost:5432/db')
ensureEnvDefault('CODEBUFF_GITHUB_ID', 'test-id')
ensureEnvDefault('CODEBUFF_GITHUB_SECRET', 'test-secret')
ensureEnvDefault('NEXTAUTH_SECRET', 'test-secret')
ensureEnvDefault('STRIPE_SECRET_KEY', 'sk_test_dummy')
ensureEnvDefault('STRIPE_WEBHOOK_SECRET_KEY', 'whsec_dummy')
ensureEnvDefault('STRIPE_USAGE_PRICE_ID', 'price_test')
ensureEnvDefault('STRIPE_TEAM_FEE_PRICE_ID', 'price_test')
ensureEnvDefault('LOOPS_API_KEY', 'test')
ensureEnvDefault('DISCORD_PUBLIC_KEY', 'test')
ensureEnvDefault('DISCORD_BOT_TOKEN', 'test')
ensureEnvDefault('DISCORD_APPLICATION_ID', 'test')
ensureEnvDefault('API_KEY_ENCRYPTION_SECRET', '12345678901234567890123456789012')


// Only log environment in non-production
if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
  console.log('Using environment:', process.env.NEXT_PUBLIC_CB_ENVIRONMENT)
}

export const env = serverEnvSchema.parse(serverProcessEnv)
