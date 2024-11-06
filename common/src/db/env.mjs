import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'
import dotenv from 'dotenv'
import path from 'path'

const stackEnvPath = path.join(__dirname, '../../../stack.env')
console.log('Loading stack.env from:', stackEnvPath)
const stackResult = dotenv.config({ path: stackEnvPath })
console.log('Stack env loaded:', stackResult)

// Force set the environment from stack.env
if (stackResult.parsed?.ENVIRONMENT) {
  process.env.ENVIRONMENT = stackResult.parsed.ENVIRONMENT
}

console.log('ENVIRONMENT after loading stack.env:', process.env.ENVIRONMENT)

if (!process.env.ENVIRONMENT) {
  console.error('ENVIRONMENT is not set, please check `stack.env`')
  process.exit(1)
}

const DOTENV_PATH = process.env.RENDER === 'true' ? '/etc/secrets' : path.join(__dirname, '../../..')
const envPath = path.join(DOTENV_PATH, `.env.${process.env.ENVIRONMENT}`)
console.log(`Using environment: ${process.env.ENVIRONMENT} (path: ${envPath})`)
dotenv.config({ path: envPath })

export const env = createEnv({
  server: {
    ENVIRONMENT: z.string().min(1),
    DATABASE_URL: z.string().min(1),
  },
  runtimeEnv: process.env,
})
