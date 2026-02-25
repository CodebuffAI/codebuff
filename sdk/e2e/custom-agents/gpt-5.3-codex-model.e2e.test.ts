import { beforeAll, describe, expect, test } from 'bun:test'

import { CodebuffClient } from '../../src'
import {
  DEFAULT_TIMEOUT,
  EventCollector,
  getApiKey,
  skipIfNoApiKey,
} from '../utils'

import type { AgentDefinition } from '../../src'

describe('Custom Agents: openai/gpt-5.3-codex model', () => {
  let client: CodebuffClient

  const codexModelAgent: AgentDefinition = {
    id: 'gpt-5-3-codex-smoke',
    displayName: 'GPT-5.3 Codex Smoke',
    model: 'openai/gpt-5.3-codex',
    instructionsPrompt: 'Respond in one short sentence.',
  }

  beforeAll(() => {
    if (skipIfNoApiKey()) return
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  test(
    'runs a minimal custom agent successfully',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()
      const result = await client.run({
        agent: codexModelAgent.id,
        prompt: 'Say hello',
        agentDefinitions: [codexModelAgent],
        handleEvent: collector.handleEvent,
      })

      expect(result.output.type).not.toBe('error')
      expect(collector.hasEventType('finish')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )
})
