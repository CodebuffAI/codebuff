const fs = require('fs')
const { match } = require('ts-pattern')
const dotenv = require('dotenv')

const ENV_VARS_TO_PULL = ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_BACKEND_URL']

dotenv.config({ path: '../stack.env' })
if (!process.env.ENVIRONMENT) {
  console.error('ENVIRONMENT is not set, please check `stack.env`')
  process.exit(1)
}

const path = `../.env.${process.env.ENVIRONMENT}`
console.log(`Using environment: ${process.env.ENVIRONMENT} (path: ${path})`)

const envFileContent = fs.readFileSync(path, 'utf-8')
const lines = envFileContent.split('\n')
const env = {
  ENVIRONMENT: process.env.ENVIRONMENT,
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
