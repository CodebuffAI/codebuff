#!/usr/bin/env bun

import { OpenbuffClient, describeLoadedProviderConfig, loadProviderConfigSync } from '@openbuff/sdk'

import { loadAgentDefinitions } from '../cli/src/utils/local-agent-registry'

const prompt =
  'Smoke test only. Reply with exactly OPENBUFF_SMOKE_OK and do not use tools.'
const timeoutMs = Number(process.env.OPENBUFF_SMOKE_TIMEOUT_MS ?? 60_000)

console.log(describeLoadedProviderConfig(loadProviderConfigSync()))

const abortController = new AbortController()
const timeout = setTimeout(() => abortController.abort(), timeoutMs)

try {
  const client = new OpenbuffClient({
    cwd: process.cwd(),
    agentDefinitions: loadAgentDefinitions(),
  })

  const result = await client.run({
    agent: 'base2',
    prompt,
    signal: abortController.signal,
  })

  if (result.output?.type === 'error') {
    console.error(`Openbuff smoke failed: ${result.output.message}`)
    process.exit(1)
  }

  const output =
    result.output?.type === 'lastMessage' || result.output?.type === 'allMessages'
      ? JSON.stringify(result.output.value)
      : result.output?.type === 'structuredOutput'
        ? JSON.stringify(result.output.value)
        : ''
  console.log(output || '(no textual output)')
  if (!output.includes('OPENBUFF_SMOKE_OK')) {
    console.error('Openbuff smoke failed: expected OPENBUFF_SMOKE_OK in output.')
    process.exit(1)
  }

  console.log('Openbuff smoke passed.')
} finally {
  clearTimeout(timeout)
}
