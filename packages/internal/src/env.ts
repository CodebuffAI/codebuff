import { createEnv } from '@t3-oss/env-nextjs'

import { clientEnvSchema, serverEnvSchema } from './env-schema'

// Only log environment in non-production
if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
  console.log('Using environment:', process.env.NEXT_PUBLIC_CB_ENVIRONMENT)
}

// Client env vars MUST be explicitly listed for Next.js to inline them
const clientRuntimeEnv = {
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
  NEXT_PUBLIC_LINKEDIN_PARTNER_ID: process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID,
  NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID:
    process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION_ID,
  NEXT_PUBLIC_WEB_PORT: process.env.NEXT_PUBLIC_WEB_PORT,
}

const envSchema = {
  server: serverEnvSchema,
  client: clientEnvSchema,
  // Only expose NEXT_PUBLIC_* values here; server secrets stay in process.env.
  experimental__runtimeEnv: clientRuntimeEnv,
  skipValidation: process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'test',
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
