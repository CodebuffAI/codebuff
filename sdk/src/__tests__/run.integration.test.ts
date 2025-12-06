import { API_KEY_ENV_VAR } from '@codebuff/common/old-constants'
import { describe, expect, it } from 'bun:test'

// Force test environment for this integration so we hit the seeded local backend
process.env.NEXT_PUBLIC_CB_ENVIRONMENT = 'test'

let CodebuffClient: typeof import('../client').CodebuffClient

describe('Prompt Caching', () => {
  const AGENT_ID = 'ask'

  it(
    'runs a basic prompt successfully',
    async () => {
      const prompt = 'respond with "hi"'

      const apiKey = process.env[API_KEY_ENV_VAR]
      if (!apiKey) {
        throw new Error('API key not found')
      }

      if (!CodebuffClient) {
        // Lazy import after setting env vars above
        CodebuffClient = (await import('../client')).CodebuffClient
      }

      const client = new CodebuffClient({
        apiKey,
      })

      const isConnected = await client.checkConnection()
      expect(isConnected).toBe(true)

      const run = await client.run({
        prompt,
        agent: AGENT_ID,
      })

      console.dir(run.output, { depth: null })
      expect(run.output.type).not.toEqual('error')
    },
    { timeout: 20_000 },
  )
})
