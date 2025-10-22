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
    const sdkDistPath = path.join(__dirname, '../../../sdk/dist/index.js')
    return fs.existsSync(sdkDistPath)
  } catch {
    return false
  }
}

/**
 * Sleep utility for async delays
 */
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
