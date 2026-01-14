import { serverEnvSchema, serverProcessEnv } from './env-schema'

// Only provide safe defaults in CI to avoid schema failures during tests
// In local dev, missing env vars should fail fast so devs know to configure them
const isCI = process.env.CI === 'true' || process.env.CI === '1'

if (isCI) {
  const ensureEnvDefault = (key: string, value: string) => {
    if (!process.env[key]) {
      process.env[key] = value
    }
  }

  ensureEnvDefault('OPEN_ROUTER_API_KEY', 'test')
  ensureEnvDefault('OPENAI_API_KEY', 'test')
  ensureEnvDefault('ANTHROPIC_API_KEY', 'test')
  ensureEnvDefault('LINKUP_API_KEY', 'test')
  ensureEnvDefault('GRAVITY_API_KEY', 'test')
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
}

// Only log environment in non-production
if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
  console.log('Using environment:', process.env.NEXT_PUBLIC_CB_ENVIRONMENT)
}

export const env = serverEnvSchema.parse(serverProcessEnv)
