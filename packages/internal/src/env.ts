import { createEnv } from '@t3-oss/env-nextjs'

import { clientEnvSchema, serverEnvSchema } from './env-schema'

// Only log environment in non-production
if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod') {
  console.log('Using environment:', process.env.NEXT_PUBLIC_CB_ENVIRONMENT)
}

type ServerEnvKey = keyof typeof serverEnvSchema
type ClientEnvKey = keyof typeof clientEnvSchema

const runtimeEnv = Object.fromEntries([
  ...Object.keys(serverEnvSchema).map((key) => [key, process.env[key]]),
  ...Object.keys(clientEnvSchema).map((key) => [key, process.env[key]]),
]) as Record<ServerEnvKey | ClientEnvKey, string | undefined>

const envSchema = {
  server: serverEnvSchema,
  client: clientEnvSchema,
  runtimeEnv,
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
