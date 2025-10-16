#!/usr/bin/env node
import './polyfills/bun-strip-ansi'
import { render } from '@opentui/react'
import React from 'react'

import { App } from './chat'
import { clearLogFile } from './utils/logger'

function parseArgs(): { initialPrompt: string | null; clearLogs: boolean } {
  const args = process.argv.slice(2)
  const clearLogs = args.includes('--clear-logs')

  // Filter out --clear-logs and use remaining args as the prompt
  const promptArgs = args.filter((arg) => arg !== '--clear-logs')
  const initialPrompt = promptArgs.length > 0 ? promptArgs.join(' ') : null

  return { initialPrompt, clearLogs }
}

const { initialPrompt, clearLogs } = parseArgs()

if (clearLogs) {
  clearLogFile()
}

if (initialPrompt) {
  render(<App initialPrompt={initialPrompt} />)
} else {
  render(<App />)
}
