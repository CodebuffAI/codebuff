import fs from 'fs'
import os from 'os'
import path from 'path'
import { execSync } from 'child_process'

import { WEBSITE_URL } from '@codebuff/sdk'
import { z } from 'zod'

const EVALBUFF_API_KEY_ENV_VAR = 'EVALBUFF_API_KEY'

const userSchema = z.object({
  name: z.string(),
  email: z.string(),
  authToken: z.string(),
  fingerprintId: z.string().optional(),
  fingerprintHash: z.string().optional(),
})

type User = z.infer<typeof userSchema>

const credentialsSchema = z.object({
  default: userSchema.optional(),
})

export function getConfigDir(): string {
  return path.join(os.homedir(), '.config', 'evalbuff')
}

export function getCredentialsPath(): string {
  return path.join(getConfigDir(), 'credentials.json')
}

export function getUserCredentials(): User | null {
  const credentialsPath = getCredentialsPath()
  if (!fs.existsSync(credentialsPath)) return null

  try {
    const raw = fs.readFileSync(credentialsPath, 'utf8')
    const parsed = credentialsSchema.parse(JSON.parse(raw))
    return parsed.default ?? null
  } catch {
    return null
  }
}

export function getAuthToken(): string | undefined {
  const envToken = process.env[EVALBUFF_API_KEY_ENV_VAR]
  if (envToken) return envToken

  const user = getUserCredentials()
  return user?.authToken
}

export function saveUserCredentials(user: User): void {
  const configDir = getConfigDir()
  const credentialsPath = getCredentialsPath()

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }

  let existing: Record<string, unknown> = {}
  if (fs.existsSync(credentialsPath)) {
    try {
      existing = JSON.parse(fs.readFileSync(credentialsPath, 'utf8'))
    } catch {
      // ignore
    }
  }

  fs.writeFileSync(
    credentialsPath,
    JSON.stringify({ ...existing, default: user }, null, 2),
  )
}

export function clearUserCredentials(): void {
  const credentialsPath = getCredentialsPath()
  if (!fs.existsSync(credentialsPath)) return

  try {
    const { default: _, ...rest } = JSON.parse(
      fs.readFileSync(credentialsPath, 'utf8'),
    )
    if (Object.keys(rest).length === 0) {
      fs.unlinkSync(credentialsPath)
    } else {
      fs.writeFileSync(credentialsPath, JSON.stringify(rest, null, 2))
    }
  } catch {
    // ignore
  }
}

function generateFingerprintId(): string {
  return `evalbuff-${Math.random().toString(36).substring(2, 15)}`
}

function openBrowser(url: string): void {
  try {
    const platform = process.platform
    if (platform === 'darwin') {
      execSync(`open ${JSON.stringify(url)}`, { stdio: 'ignore' })
    } else if (platform === 'linux') {
      execSync(`xdg-open ${JSON.stringify(url)}`, { stdio: 'ignore' })
    } else if (platform === 'win32') {
      execSync(`start ${JSON.stringify(url)}`, { stdio: 'ignore' })
    }
  } catch {
    // Browser open failed, user will need to copy the URL
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function loginFlow(): Promise<User> {
  const fingerprintId = generateFingerprintId()

  const codeResponse = await fetch(`${WEBSITE_URL}/api/auth/cli/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprintId }),
  })

  if (!codeResponse.ok) {
    throw new Error('Failed to initiate login. Check your internet connection.')
  }

  const { loginUrl, fingerprintHash, expiresAt } = (await codeResponse.json()) as {
    loginUrl: string
    fingerprintHash: string
    expiresAt: string
  }

  process.stderr.write(`\nOpen this URL to log in:\n\n  ${loginUrl}\n\n`)
  process.stderr.write('Waiting for authentication...\n')
  openBrowser(loginUrl)

  const startTime = Date.now()
  const timeoutMs = 5 * 60 * 1000
  const pollIntervalMs = 5000

  while (Date.now() - startTime < timeoutMs) {
    await sleep(pollIntervalMs)

    try {
      const params = new URLSearchParams({
        fingerprintId,
        fingerprintHash,
        expiresAt,
      })
      const statusResponse = await fetch(
        `${WEBSITE_URL}/api/auth/cli/status?${params}`,
      )

      if (statusResponse.ok) {
        const data = (await statusResponse.json()) as {
          user?: Record<string, unknown>
        }
        if (data.user) {
          const user: User = {
            name: String(data.user.name ?? ''),
            email: String(data.user.email ?? ''),
            authToken: String(data.user.authToken ?? ''),
            fingerprintId,
            fingerprintHash,
          }
          saveUserCredentials(user)
          return user
        }
      }
    } catch {
      // Network error during polling, continue
    }
  }

  throw new Error('Login timed out. Please try again.')
}

export async function ensureAuth(): Promise<string> {
  const token = getAuthToken()
  if (token) return token

  const user = await loginFlow()
  return user.authToken
}
