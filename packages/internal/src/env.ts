import { serverEnvSchema, serverProcessEnv } from './env-schema'

// Only provide safe defaults in CI to avoid schema failures during tests
// In local dev, missing env vars should fail fast so devs know to configure them
const isCI = process.env.CI === 'true' || process.env.CI === '1'
const envInput = { ...serverProcessEnv }

if (isCI) {
  const ensureEnvDefault = (key: string, value: string) => {
    if (!process.env[key]) {
      process.env[key] = value
    }
    envInput[key as keyof typeof envInput] = process.env[key]
  }

  ensureEnvDefault('OPEN_ROUTER_API_KEY', 'test')
  ensureEnvDefault('OPENAI_API_KEY', 'test')
  ensureEnvDefault('ANTHROPIC_API_KEY', 'test')
  ensureEnvDefault('FIREWORKS_API_KEY', 'test')
  ensureEnvDefault('CANOPYWAVE_API_KEY', 'test')
  ensureEnvDefault('LINKUP_API_KEY', 'test')
  ensureEnvDefault('GRAVITY_API_KEY', 'test')
  ensureEnvDefault('IPINFO_TOKEN', 'test')
  ensureEnvDefault('PORT', '4242')
  ensureEnvDefault('DATABASE_URL', 'postgres://user:pass@localhost:5432/db')
  ensureEnvDefault('CODEBUFF_GITHUB_ID', 'test-id')
  ensureEnvDefault('CODEBUFF_GITHUB_SECRET', 'test-secret')
  ensureEnvDefault('FREEBUFF_GITHUB_ID', 'test-id')
  ensureEnvDefault('FREEBUFF_GITHUB_SECRET', 'test-secret')
  ensureEnvDefault('NEXTAUTH_SECRET', 'test-secret')
  ensureEnvDefault('STRIPE_SECRET_KEY', 'sk_test_dummy')
  ensureEnvDefault('STRIPE_WEBHOOK_SECRET_KEY', 'whsec_dummy')
  ensureEnvDefault('STRIPE_TEAM_FEE_PRICE_ID', 'price_test')
  ensureEnvDefault('STRIPE_SUBSCRIPTION_100_PRICE_ID', 'price_test_100')
  ensureEnvDefault('STRIPE_SUBSCRIPTION_200_PRICE_ID', 'price_test_200')
  ensureEnvDefault('STRIPE_SUBSCRIPTION_500_PRICE_ID', 'price_test_500')
  ensureEnvDefault('LOOPS_API_KEY', 'test')
  ensureEnvDefault('DISCORD_PUBLIC_KEY', 'test')
  ensureEnvDefault('DISCORD_BOT_TOKEN', 'test')
  ensureEnvDefault('DISCORD_APPLICATION_ID', 'test')
}

// Only log environment in non-production
if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
  console.log('Using environment:', process.env.NEXT_PUBLIC_CB_ENVIRONMENT)

  // `CVADC53U` is the public test zone documented by BuySellAds — safe to use
  // in dev/CI so nobody has to configure anything to see Carbon ads render.
  // Prod intentionally has no default: if CARBON_ZONE_KEY isn't set there,
  // waiting-room requests return no ad rather than silently hitting test
  // inventory.
  if (!process.env.CARBON_ZONE_KEY) {
    process.env.CARBON_ZONE_KEY = 'CVADC53U'
  }
}

export const env = serverEnvSchema.parse(envInput)
