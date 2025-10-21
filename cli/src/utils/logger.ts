import { appendFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'

import { findGitRoot } from './git'

import type { Logger } from '@codebuff/common/types/contracts/logger'

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

function format(str: string, ...args: any[]): string {
  return str.replace(/{(\d+)}/g, (match, index) =>
    typeof args[index] !== 'undefined' ? args[index] : match,
  )
}

function formatMessage(
  level: string,
  data: unknown,
  message: string | undefined,
  ...args: unknown[]
): string {
  const timestamp = formatTimestamp()
  let logLines = [
    `[${timestamp}] [${level}] ${format(message ?? 'No message provided', args)}`,
  ]

  if (data !== undefined) {
    try {
      if (data instanceof Error) {
        logLines.push(`  Error: ${data.message}`)
        if (data.stack) {
          logLines.push(`  Stack: ${data.stack}`)
        }
      } else if (typeof data === 'object') {
        logLines.push(`  Data: ${JSON.stringify(data, null, 2)}`)
      } else {
        logLines.push(`  Data: ${String(data)}`)
      }
    } catch (error) {
      logLines.push(`  Data: [Unable to stringify]`)
    }
  }

  logLines.push('')

  return logLines.join('\n')
}

function writeLog(
  level: string,
  data: unknown,
  message: string | undefined,
  ...args: unknown[]
) {
  try {
    ensureLogDirectory()
    const formattedMessage = formatMessage(level, data, message, ...args)
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
  info: (data: any, message?: string, ...args: any[]) =>
    writeLog('INFO', data, message, ...args),
  debug: (data: any, message?: string, ...args: any[]) =>
    writeLog('DEBUG', data, message, ...args),
  warn: (data: any, message?: string, ...args: any[]) =>
    writeLog('WARN', data, message, ...args),
  error: (data: any, message?: string, ...args: any[]) =>
    writeLog('ERROR', data, message, ...args),
} satisfies Logger
