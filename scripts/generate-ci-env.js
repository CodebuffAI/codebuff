#!/usr/bin/env node

// Script to dynamically generate environment variables for GitHub Actions
// by reading the required variables from env.ts and outputting them as a JSON array.
// Supports optional filters so callers can request only specific subsets.

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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

function extractEnvVarsFromEnvTs() {
  const envTsPath = path.join(
    __dirname,
    '..',
    'packages',
    'internal',
    'src',
    'env.ts',
  )
  const envTsContent = fs.readFileSync(envTsPath, 'utf8')

  const serverMatch = envTsContent.match(/server:\s*{([^}]+)}/s)
  const clientMatch = envTsContent.match(/client:\s*{([^}]+)}/s)

  const serverVars = new Set()
  const clientVars = new Set()

  const extractVars = (match, targetSet) => {
    if (!match) return
    const vars = match[1].match(/(\w+):/g)
    if (!vars) return
    vars.forEach((v) => targetSet.add(v.replace(':', '')))
  }

  extractVars(serverMatch, serverVars)
  extractVars(clientMatch, clientVars)

  return {
    server: Array.from(serverVars),
    client: Array.from(clientVars),
  }
}

function generateGitHubEnv() {
  const { prefix, scope } = parseArgs()
  const varsByScope = extractEnvVarsFromEnvTs()

  let selected = []
  if (scope === 'server') {
    selected = varsByScope.server
  } else if (scope === 'client') {
    selected = varsByScope.client
  } else {
    selected = Array.from(new Set([...varsByScope.server, ...varsByScope.client]))
  }

  if (prefix) {
    selected = selected.filter((name) => name.startsWith(prefix))
  }

  selected.sort()
  console.log(JSON.stringify(selected))
}

generateGitHubEnv()
