import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'


/**
 * Check if tmux is available on the system
 */
export function isTmuxAvailable(): boolean {
  try {
    execSync('which tmux', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

/**
 * Check if the SDK is built by checking for the dist directory
 */
export function isSDKBuilt(): boolean {
  try {
    const sdkDistDir = path.join(__dirname, '../../../sdk/dist')
    const possibleArtifacts = ['index.js', 'index.mjs', 'index.cjs']
    return possibleArtifacts.some((file) =>
      fs.existsSync(path.join(sdkDistDir, file)),
    )
  } catch {
    return false
  }
}

/**
 * Sleep utility for async delays
 */
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

let cachedEnv: Record<string, string> | null = null

function loadCliEnv(): Record<string, string> {
  if (cachedEnv) {
    return cachedEnv
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { env } = require('../../../packages/internal/src/env') as {
      env: Record<string, unknown>
    }

    cachedEnv = Object.entries(env).reduce<Record<string, string>>((acc, [key, value]) => {
      if (value !== undefined && value !== null) {
        acc[key] = String(value)
      }
      return acc
    }, {})

    return cachedEnv
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error loading environment'
    throw new Error(
      `Failed to load CLI environment via packages/internal/src/env: ${message}. ` +
        'Run commands via "infisical run -- bun …" or export the required variables.',
    )
  }
}

export function ensureCliTestEnv(): void {
  loadCliEnv()
}

export function getDefaultCliEnv(): Record<string, string> {
  return { ...loadCliEnv() }
}
