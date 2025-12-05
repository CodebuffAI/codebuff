import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { describe, expect, it } from 'bun:test'

import { CodebuffClient } from '../client'

function getApiKeyOrSkip(): string | null {
  const apiKey = process.env[API_KEY_ENV_VAR]
  const isPlaceholder = !apiKey || ['test-codebuff', 'dummy-token'].includes(apiKey)

  if (!process.env.CI && isPlaceholder) {
    console.warn('Skipping SDK prompt caching integration: CODEBUFF_API_KEY missing or placeholder')
    return null
  }

  if (!apiKey) {
    throw new Error('API key not found')
  }

  return apiKey
}

describe('Prompt Caching', () => {
  it(
    'should be cheaper on second request',
    async () => {
      const filler =
        `Run UUID: ${crypto.randomUUID()} ` +
        'Ignore this text. This is just to make the prompt longer. '.repeat(500)
      const prompt = 'respond with "hi"'

      const apiKey = getApiKeyOrSkip()
      if (!apiKey) return

      const client = new CodebuffClient({
        apiKey,
      })
      let cost1 = -1
      const run1 = await client.run({
        prompt: `${filler}\n\n${prompt}`,
        agent: 'base',
        handleEvent: (event) => {
          if (event.type === 'finish') {
            cost1 = event.totalCost
          }
        },
      })

      console.dir(run1.output, { depth: null })
      expect(run1.output.type).not.toEqual('error')
      expect(cost1).toBeGreaterThanOrEqual(0)

      let cost2 = -1
      const run2 = await client.run({
        prompt,
        agent: 'base',
        previousRun: run1,
        handleEvent: (event) => {
          if (event.type === 'finish') {
            cost2 = event.totalCost
          }
        },
      })

      console.dir(run2.output, { depth: null })
      expect(run2.output.type).not.toEqual('error')
      expect(cost2).toBeGreaterThanOrEqual(0)

      expect(cost1).toBeGreaterThan(cost2)
    },
    { timeout: 20_000 },
  )
})
