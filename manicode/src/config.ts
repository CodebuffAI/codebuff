import * as fs from 'fs'
import * as path from 'path'

export function loadEnvironmentVariables() {
  const envPath = path.join(__dirname, '.env')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const envLines = envContent.split('\n')
    for (const line of envLines) {
      const [key, value] = line.split('=')
      if (key && value) {
        process.env[key.trim()] = value.trim()
      }
    }
  }
}

const isProduction = false // process.env.NODE_ENV === 'production'
console.log('isProduction', isProduction, process.env.NODE_ENV)
export const websocketUrl = isProduction
  ? 'wss://manicode.ai:4242/ws'
  : 'ws://localhost:4242/ws'
export const projectRoot = path.resolve(__dirname, '..')
