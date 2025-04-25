const fs = require('fs')

const dotenv = require('dotenv')
const { match } = require('ts-pattern')

const ENV_VARS_TO_PULL = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_BACKEND_URL',
  'NEXT_PUBLIC_SUPPORT_EMAIL',
  'NEXT_PUBLIC_POSTHOG_API_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST_URL',
]

dotenv.config({ path: '../stack.env' })
if (!process.env.NEXT_PUBLIC_CB_ENVIRONMENT) {
  console.error(
    'NEXT_PUBLIC_CB_ENVIRONMENT is not set, please check `stack.env`'
  )
  process.exit(1)
}

const path = `../.env.${process.env.NEXT_PUBLIC_CB_ENVIRONMENT}`
console.log(
  `Using environment: ${process.env.NEXT_PUBLIC_CB_ENVIRONMENT} (path: ${path})`
)

const envFileContent = fs.readFileSync(path, 'utf-8')
const lines = envFileContent.split('\n')
const env = {
  NEXT_PUBLIC_CB_ENVIRONMENT: process.env.NEXT_PUBLIC_CB_ENVIRONMENT,
}

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

if (Object.values(env).length === ENV_VARS_TO_PULL.length) {
  throw new Error('Missing expected environment variable(s)!')
}

module.exports = Promise.resolve(env)
