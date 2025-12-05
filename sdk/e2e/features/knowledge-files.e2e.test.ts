/**
 * E2E Test: Knowledge Files
 *
 * Tests knowledgeFiles injection for providing context to the agent.
 */

import { describe, test, expect, beforeAll } from 'bun:test'

import { CodebuffClient } from '../../src/client'
import { EventCollector, getApiKey, skipIfNoApiKey, isAuthError, DEFAULT_AGENT, DEFAULT_TIMEOUT } from '../utils'

describe('Features: Knowledge Files', () => {
  let client: CodebuffClient

  beforeAll(() => {
    if (skipIfNoApiKey()) return
    client = new CodebuffClient({ apiKey: getApiKey() })
  })

  test(
    'agent uses injected knowledge files',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'What is the secret code word mentioned in my knowledge files?',
        knowledgeFiles: {
          'knowledge/secret.md': 'The secret code word is: PINEAPPLE42',
        },
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      expect(result.output.type).not.toBe('error')

      const responseText = collector.getFullText().toUpperCase()
      expect(responseText.includes('PINEAPPLE42') || responseText.includes('PINEAPPLE')).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )

  test(
    'multiple knowledge files are accessible',
    async () => {
      if (skipIfNoApiKey()) return

      const collector = new EventCollector()

      const result = await client.run({
        agent: DEFAULT_AGENT,
        prompt: 'What are the two company values mentioned in my knowledge files?',
        knowledgeFiles: {
          'knowledge/values.md': 'Company value 1: Innovation\nCompany value 2: Integrity',
          'knowledge/mission.md': 'Our mission is to build great software.',
        },
        handleEvent: collector.handleEvent,
      })

      if (isAuthError(result.output)) return

      expect(result.output.type).not.toBe('error')

      const responseText = collector.getFullText().toLowerCase()
      expect(
        responseText.includes('innovation') || responseText.includes('integrity'),
      ).toBe(true)
    },
    DEFAULT_TIMEOUT,
  )
})
