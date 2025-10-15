import { appendFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'

import { findGitRoot } from './git'

const PROJECT_ROOT = findGitRoot()
const LOG_DIR = join(PROJECT_ROOT, 'debug')
const LOG_FILE = join(LOG_DIR, 'cli.log')

function ensureLogDirectory() {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true })
  }
}

function formatTimestamp(): string {
  const now = new Date()
  return now.toISOString()
}

function formatMessage(level: string, message: string, data?: any): string {
  const timestamp = formatTimestamp()
  let logLine = `[${timestamp}] [${level}] ${message}`
  
  if (data !== undefined) {
    try {
      if (data instanceof Error) {
        logLine += `\n  Error: ${data.message}`
        if (data.stack) {
          logLine += `\n  Stack: ${data.stack}`
        }
      } else if (typeof data === 'object') {
        logLine += `\n  Data: ${JSON.stringify(data, null, 2)}`
      } else {
        logLine += `\n  Data: ${String(data)}`
      }
    } catch (error) {
      logLine += `\n  Data: [Unable to stringify]`
    }
  }
  
  return logLine + '\n'
}

function writeLog(level: string, message: string, data?: any) {
  try {
    ensureLogDirectory()
    const formattedMessage = formatMessage(level, message, data)
    appendFileSync(LOG_FILE, formattedMessage, 'utf8')
  } catch (error) {
    console.error('Failed to write to log file:', error)
  }
}

export function clearLogFile() {
  try {
    if (existsSync(LOG_FILE)) {
      unlinkSync(LOG_FILE)
    }
  } catch (error) {
    console.error('Failed to clear log file:', error)
  }
}

export const logger = {
  info: (message: string, data?: any) => writeLog('INFO', message, data),
  warn: (message: string, data?: any) => writeLog('WARN', message, data),
  error: (message: string, data?: any) => writeLog('ERROR', message, data),
}
