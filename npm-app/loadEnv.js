const fs = require('fs')
const { match } = require('ts-pattern')
const dotenv = require('dotenv')

dotenv.config({ path: '../stack.env' })
if (!process.env.ENVIRONMENT) {
  console.error('ENVIRONMENT is not set, please check `stack.env`')
  process.exit(1)
}

const DOTENV_PATH = process.env.ENVIRONMENT === 'local' ? '..' : '/etc/secrets'
const path = `${DOTENV_PATH}/.env.${process.env.ENVIRONMENT}`
console.log(`Using environment: ${process.env.ENVIRONMENT} (path: ${path})`)

const envFileContent = fs.readFileSync(path, 'utf-8')
const lines = envFileContent.split('\n')
const env = {}

lines.forEach((line) => {
  const trimmedLine = line.trim()
  if (!trimmedLine || trimmedLine.startsWith('#')) return

  const [key, value] = trimmedLine.split('=')

  match(key).with(
    'ENVIRONMENT',
    'APP_URL',
    'NEXT_PUBLIC_BACKEND_URL',
    (key) => {
      env[key] = value
    }
  )
})

module.exports = Promise.resolve(env)
