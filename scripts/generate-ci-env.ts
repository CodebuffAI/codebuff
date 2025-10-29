#!/usr/bin/env node

// Script to dynamically generate environment variables for GitHub Actions
// by reading the required variables from env.ts and outputting them as a JSON array.
// Supports optional filters so callers can request only specific subsets.

import path from 'path'
import { fileURLToPath } from 'url'

import { CLIENT_ENV_PREFIX, clientEnvVars } from '@codebuff/common/env-schema'
import { serverEnvVars } from '@codebuff/internal/env-schema'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const args = process.argv.slice(2)

function parseArgs() {
  let prefix = ''
  let scope = 'all'

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--prefix' && args[i + 1]) {
      prefix = args[i + 1]
      i += 1
      continue
    }
    if (arg.startsWith('--prefix=')) {
      prefix = arg.split('=')[1] ?? ''
      continue
    }
    if (arg === '--scope' && args[i + 1]) {
      scope = args[i + 1]
      i += 1
      continue
    }
    if (arg.startsWith('--scope=')) {
      scope = arg.split('=')[1] ?? 'all'
    }
  }

  if (!['all', 'server', 'client'].includes(scope)) {
    scope = 'all'
  }

  return { prefix, scope }
}

function generateGitHubEnv() {
  const { prefix, scope } = parseArgs()
  const varsByScope = {
    all: serverEnvVars,
    client: clientEnvVars,
  }

  let selected: string[] = []
  if (scope === 'server') {
    selected = varsByScope.all.filter(
      (name) => !name.startsWith(CLIENT_ENV_PREFIX),
    )
  } else if (scope === 'client') {
    selected = varsByScope.client
  } else {
    selected = varsByScope.all
  }

  if (prefix) {
    selected = selected.filter((name) => name.startsWith(prefix))
  }

  selected.sort()
  console.log(JSON.stringify(selected))
}

generateGitHubEnv()
