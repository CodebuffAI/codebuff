import fs from 'fs'
import path from 'path'
import { logger } from './logger'

export const DEBUG_MODE = true // Set this to false to disable debug logging
const DEBUG_LOG_FILE = path.join(__dirname, '..', 'debug.log')

export function debugLog(...args: any[]) {
  if (DEBUG_MODE) {
    logger.debug('[DEBUG]', ...args)
    const logMessage =
      args
        .map((arg) =>
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
        )
        .join(' ') + '\n'
    fs.appendFileSync(
      DEBUG_LOG_FILE,
      `[${new Date().toISOString()}] ${logMessage}`
    )
  }
}

export function clearDebugLog() {
  if (DEBUG_MODE) {
    fs.writeFileSync(DEBUG_LOG_FILE, '')
  }
}
