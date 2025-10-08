#!/usr/bin/env node
import { render } from '@opentui/react'
import { App } from './chat'
import React from 'react'

function parseArgs(): string | null {
  const args = process.argv.slice(2)
  const pIndex = args.indexOf('-p')
  
  if (pIndex !== -1 && pIndex < args.length - 1) {
    return args[pIndex + 1]
  }
  
  return null
}

const initialPrompt = parseArgs()

if (initialPrompt) {
  render(<App initialPrompt={initialPrompt} />)
} else {
  render(<App />)
}
