import { clientEnvSchema, clientProcessEnv } from './env-schema'

const parsedEnv = clientEnvSchema.safeParse(clientProcessEnv)
if (!parsedEnv.success) {
  throw parsedEnv.error
}

export const env = parsedEnv.data

// Only log environment in non-production
if (env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
  console.log('Using environment:', env.NEXT_PUBLIC_CB_ENVIRONMENT)
}

// Derived environment constants for convenience
export const IS_DEV = env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev'
export const IS_TEST = env.NEXT_PUBLIC_CB_ENVIRONMENT === 'test'
export const IS_PROD = env.NEXT_PUBLIC_CB_ENVIRONMENT === 'prod'
export const IS_CI = process.env.CODEBUFF_GITHUB_ACTIONS === 'true'

// Debug flag for logging analytics events in dev mode
// Set to true when actively debugging analytics - affects both CLI and backend
export const DEBUG_ANALYTICS = false
