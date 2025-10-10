#!/usr/bin/env node
import { render } from '@opentui/react'
import React from 'react'

import { App } from './chat'
import { clearLogFile } from './utils/logger'

function parseArgs(): { initialPrompt: string | null; clearLogs: boolean } {
  const args = process.argv.slice(2)
  const pIndex = args.indexOf('-p')
  const clearLogs = args.includes('--clear-logs')

  let initialPrompt: string | null = null
  if (pIndex !== -1 && pIndex < args.length - 1) {
    initialPrompt = args[pIndex + 1]
  }

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
