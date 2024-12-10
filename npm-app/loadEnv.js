const fs = require('fs')
const { match } = require('ts-pattern')
const dotenv = require('dotenv')

const ENV_VARS_TO_PULL = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_BACKEND_URL',
  'NEXT_PUBLIC_SUPPORT_EMAIL',
]

// Default environment for local development
const defaultEnv = {
  ENVIRONMENT: 'local',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_BACKEND_URL: 'http://localhost:3001',
  NEXT_PUBLIC_SUPPORT_EMAIL: 'support@example.com'
}

// Try to load stack.env, but use defaults if it doesn't exist
try {
  dotenv.config({ path: '../stack.env' })
} catch (error) {
  console.log('Using default local environment')
}

// Use environment from stack.env or default to 'local'
const environment = process.env.ENVIRONMENT || 'local'
const envPath = `../.env.${environment}`

let env = { ...defaultEnv }

// Try to load environment-specific file if it exists
try {
  if (fs.existsSync(envPath)) {
    const envFileContent = fs.readFileSync(envPath, 'utf-8')
    const lines = envFileContent.split('\n')

    lines.forEach((line) => {
      const trimmedLine = line.trim()
      if (!trimmedLine || trimmedLine.startsWith('#')) return

      const [key, v] = trimmedLine.split('=')
      const value = v
        .split("'")
        .filter((t) => !!t)
        .join('')
        .trim()

      match(key).with(...ENV_VARS_TO_PULL, (key) => {
        env[key] = value
      })
    })
  }
} catch (error) {
  console.log('Using default environment variables')
}

module.exports = Promise.resolve(env)
