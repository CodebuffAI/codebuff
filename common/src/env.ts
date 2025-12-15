import {
  clientEnvSchema,
  clientProcessEnv,
  type ClientInput,
} from './env-schema'

const isTestRuntime =
  process.env.NODE_ENV === 'test' || process.env.BUN_ENV === 'test'

const TEST_ENV_DEFAULTS: ClientInput = {
  NEXT_PUBLIC_CB_ENVIRONMENT: 'test',
  NEXT_PUBLIC_CODEBUFF_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_SUPPORT_EMAIL: 'support@codebuff.com',
  NEXT_PUBLIC_POSTHOG_API_KEY: 'test-posthog-key',
  NEXT_PUBLIC_POSTHOG_HOST_URL: 'https://us.i.posthog.com',
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: 'pk_test_placeholder',
  NEXT_PUBLIC_STRIPE_CUSTOMER_PORTAL:
    'https://billing.stripe.com/p/login/test_placeholder',
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID: 'test-verification',
  NEXT_PUBLIC_WEB_PORT: '3000',
}

const envInput = isTestRuntime
  ? { ...TEST_ENV_DEFAULTS, ...clientProcessEnv }
  : clientProcessEnv

const parsedEnv = clientEnvSchema.safeParse(envInput)
if (!parsedEnv.success) {
  throw parsedEnv.error
}

export const env = parsedEnv.data

// Populate process.env with defaults during tests so direct access works
if (isTestRuntime) {
  for (const [key, value] of Object.entries(TEST_ENV_DEFAULTS)) {
    if (!process.env[key] && typeof value === 'string') {
      process.env[key] = value
    }
  }
}

// Only log environment in non-production
if (env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
  console.log('Using environment:', env.NEXT_PUBLIC_CB_ENVIRONMENT)
}

// Derived environment constants for convenience
export const IS_DEV = env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev'
export const IS_TEST = env.NEXT_PUBLIC_CB_ENVIRONMENT === 'test'
export const IS_PROD = env.NEXT_PUBLIC_CB_ENVIRONMENT === 'prod'
export const IS_CI = process.env.CODEBUFF_GITHUB_ACTIONS === 'true'
