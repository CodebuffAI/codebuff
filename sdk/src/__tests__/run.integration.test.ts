import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { describe, expect, it } from 'bun:test'

import { CodebuffClient } from '../client'

describe('Prompt Caching', () => {
  it('should be cheaper on second request', async () => {
    const filler =
      'Ignore this text. This is just to make the prompt longer. '.repeat(500)
    const prompt = 'respond with "hi"'

    const apiKey = process.env[API_KEY_ENV_VAR]
    if (!apiKey) {
      throw new Error('API key not found')
    }

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

    expect(run2.output.type).not.toEqual('error')
    expect(cost2).toBeGreaterThanOrEqual(0)

    expect(cost1).toBeGreaterThan(cost2)
  })
})
