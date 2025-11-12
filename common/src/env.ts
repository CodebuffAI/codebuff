import { clientEnvSchema, clientProcessEnv } from './env-schema'

// Only log environment in non-production, and not during OSC detection
// Check process.argv since it's more reliable than env vars in spawned processes
const isOscDetect =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv.some(arg => arg.includes('--internal-osc-detect'))
if (
  process.env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod' &&
  !isOscDetect
) {
  console.log('Using environment:', process.env.NEXT_PUBLIC_CB_ENVIRONMENT)
}

export const env = clientEnvSchema.parse(clientProcessEnv)
